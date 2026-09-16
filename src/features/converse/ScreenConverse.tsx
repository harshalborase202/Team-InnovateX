import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKiosk } from '../../context/KioskContext'
import { KioskHeader } from '../../components/KioskHeader'
import {
  getNextInterviewQuestion,
  ConversationTurn,
  InterviewStepResponse,
} from '../../services/interviewEngine'
import { speechRecognitionService } from '../../services/speechRecognition'
import { supabase } from '../../lib/supabase'
import { RedFlagAlert } from './RedFlagAlert'

export const ScreenConverse: React.FC = () => {
  const navigate = useNavigate()
  const {
    t,
    language,
    department,
    currentPatient,
    setCurrentPatient,
    currentSession,
    setCurrentSession,
    setScreenAudio,
    playAudio,
    setIsRedFlagActive,
  } = useKiosk()

  // Conversation history
  const [history, setHistory] = useState<ConversationTurn[]>([])
  const [currentTurn, setCurrentTurn] = useState<InterviewStepResponse | null>(null)
  const [loadingNext, setLoadingNext] = useState<boolean>(true)

  // Speech-to-text microphone states
  const [isListening, setIsListening] = useState<boolean>(false)
  const [liveTranscript, setLiveTranscript] = useState<string>('')
  const [speechError, setSpeechError] = useState<string | null>(null)

  // Red flag emergency trigger state
  const [activeRedFlag, setActiveRedFlag] = useState<{
    reason: string | null
    severity: 'critical' | 'high' | 'medium' | null
    recordId: string | null
  } | null>(null)

  // Sync red flag state with KioskContext to hide Call-For-Help button during red flags
  useEffect(() => {
    setIsRedFlagActive(!!activeRedFlag)
    return () => {
      setIsRedFlagActive(false)
    }
  }, [activeRedFlag, setIsRedFlagActive])

  // Text input fallback state (allows typing if microphone is unsupported/noisy)
  const [manualText, setManualText] = useState<string>('')
  const [showManualInput, setShowManualInput] = useState<boolean>(false)

  // Reference to prevent duplicate initial fetches
  const initialFetchDone = useRef(false)

  // Active department helper
  const activeDepartment = currentSession?.department || department || 'general_medicine'

  // 1. Initial Step: fetch the first question ("What is bothering you today?")
  const fetchQuestion = useCallback(async (currentHist: ConversationTurn[]) => {
    setLoadingNext(true)
    try {
      let activeSessionId = currentSession?.id
      let activeDept = currentSession?.department || department || 'general_medicine'

      // Auto-recover most recent session if page was refreshed or loaded directly
      if (!activeSessionId) {
        const { data: latest } = await supabase
          .from('sessions')
          .select('*, patients(*)')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latest) {
          activeSessionId = latest.id
          activeDept = latest.department || activeDept
          setCurrentSession(latest)
          if (latest.patients) setCurrentPatient(latest.patients)
        }
      }

      const sessionId = activeSessionId || 'demo-session-id'
      const response = await getNextInterviewQuestion(sessionId, currentHist, language, activeDept)
      setCurrentTurn(response)

      // Announce the question aloud in selected language
      const audioToPlay = response.question_localized || response.question
      setScreenAudio(audioToPlay)

      // Check if this question itself triggered an immediate red flag
      if (response.red_flag && response.red_flag_reason) {
        await handleTriggerRedFlag(response.red_flag_reason, response.severity, activeSessionId)
      }
    } catch (err) {
      console.error('Failed to load next question:', err)
    } finally {
      setLoadingNext(false)
    }
  }, [currentSession?.id, currentSession?.department, department, language, setCurrentPatient, setCurrentSession, setScreenAudio])

  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true
      fetchQuestion([])
    }
  }, [fetchQuestion])

  // Handle Red Flag insertion into database
  const handleTriggerRedFlag = async (
    reason: string,
    severity: 'critical' | 'high' | 'medium' | null,
    overrideSessionId?: string
  ) => {
    let flagId: string | null = null
    const sessionId = overrideSessionId || currentSession?.id

    if (sessionId) {
      try {
        const { data: insertedFlag, error } = await supabase
          .from('red_flags')
          .insert({
            session_id: sessionId,
            flag_type: 'clinical_history_red_flag',
            severity: severity || 'high',
            detail: reason,
            triggered_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (!error && insertedFlag) {
          flagId = insertedFlag.id
        }

        // Also record in audit log
        await supabase.from('audit_log').insert({
          session_id: sessionId,
          actor: 'kiosk_ai_interviewer',
          action: 'RED_FLAG_RAISED',
          details: { reason, severity, timestamp: new Date().toISOString() },
        })
      } catch (err) {
        console.error('Error recording red flag in database:', err)
      }
    }

    setActiveRedFlag({
      reason,
      severity,
      recordId: flagId,
    })
  }

  // Answer handler for both touch tap and voice input
  // Answer handler for both touch tap and voice input
  const handleAnswer = async (
    answerText: string,
    source: 'voice' | 'touch' = 'touch',
    optionValue?: string
  ) => {
    if (!currentTurn || !answerText.trim() || loadingNext) return
    setLoadingNext(true)

    // Cleanly stop listening and reset microphone
    speechRecognitionService.stop()
    setIsListening(false)
    setLiveTranscript('')
    setManualText('')
    setShowManualInput(false)

    const newTurn: ConversationTurn = {
      field_key: currentTurn.field_key,
      question: currentTurn.question,
      answer: answerText.trim(),
      source,
    }

    const updatedHistory = [...history, newTurn]
    setHistory(updatedHistory)

    // Hard completion check: exactly 7 questions max (or if already complete)
    const isAyush = activeDepartment === 'ayush' || activeDepartment.includes('ayush')
    const maxLimit = isAyush ? 6 : 7
    if (
      currentTurn.is_complete ||
      currentTurn.field_key === 'interview_completed' ||
      currentTurn.field_key === 'ready_for_scan' ||
      updatedHistory.length >= maxLimit
    ) {
      await handleCompleteInterview()
      return
    }

    // Save Q&A pair to Supabase in the background (NON-BLOCKING: allows instant next question)
    const sessionId = currentSession?.id
    if (sessionId) {
      ;(async () => {
        try {
          await supabase.from('history_responses').insert({
            session_id: sessionId,
            field_key: currentTurn.field_key,
            field_value_json: {
              question: currentTurn.question,
              question_localized: currentTurn.question_localized,
              answer: answerText.trim(),
              field_key: currentTurn.field_key,
              option_value: optionValue || null,
            },
            source,
            captured_at: new Date().toISOString(),
          })

          if (currentTurn.field_key.startsWith('ayush_')) {
            const matchedOpt = currentTurn.options.find(
              (o) =>
                o.label === answerText ||
                o.label_localized === answerText ||
                o.value === answerText ||
                o.value === optionValue
            )
            const optVal = optionValue || matchedOpt?.value || answerText

            const { data: existingAyush } = await supabase
              .from('ayush_history')
              .select('*')
              .eq('session_id', sessionId)
              .maybeSingle()

            const ayushPayload: Record<string, any> = {
              session_id: sessionId,
              prakriti_json: existingAyush?.prakriti_json || {},
              vikriti_json: existingAyush?.vikriti_json || {},
              agni: existingAyush?.agni || null,
              koshtha: existingAyush?.koshtha || null,
              ahara_vihara_json: existingAyush?.ahara_vihara_json || {},
              updated_at: new Date().toISOString(),
            }

            if (currentTurn.field_key === 'ayush_prakriti') {
              ayushPayload.prakriti_json = {
                constitution: optVal,
                answer: answerText.trim(),
                captured_at: new Date().toISOString(),
              }
            } else if (currentTurn.field_key === 'ayush_vikriti') {
              ayushPayload.vikriti_json = {
                imbalance: optVal,
                answer: answerText.trim(),
                captured_at: new Date().toISOString(),
              }
            } else if (currentTurn.field_key === 'ayush_agni') {
              ayushPayload.agni = optVal
            } else if (currentTurn.field_key === 'ayush_koshtha') {
              ayushPayload.koshtha = optVal
            } else if (currentTurn.field_key === 'ayush_ahara_vihara') {
              ayushPayload.ahara_vihara_json = {
                diet_routine: optVal,
                answer: answerText.trim(),
                captured_at: new Date().toISOString(),
              }
            }

            await supabase.from('ayush_history').upsert(ayushPayload, { onConflict: 'session_id' })
          }
        } catch (bgErr) {
          console.warn('Background response persist error:', bgErr)
        }
      })()
    }

    // Check if the answer triggers an immediate red flag
    const lowerAns = answerText.toLowerCase()
    if (
      (lowerAns.includes('chest') || lowerAns.includes('सीने') || lowerAns.includes('छाती')) &&
      (lowerAns.includes('breath') || lowerAns.includes('सांस') || lowerAns.includes('severe') || lowerAns.includes('दर्द'))
    ) {
      handleTriggerRedFlag(
        'Severe chest pain with respiratory discomfort reported',
        'critical'
      ).catch(console.warn)
    }

    // Advance immediately to next question
    await fetchQuestion(updatedHistory)
  }

  // Complete interview and advance to Step 3 (Scan)
  const handleCompleteInterview = async () => {
    const sessionId = currentSession?.id
    if (sessionId) {
      try {
        const { data: updated } = await supabase
          .from('sessions')
          .update({
            status: 'scan',
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId)
          .select()
          .single()

        if (updated) {
          setCurrentSession(updated)
        }
      } catch (err) {
        console.error('Failed to advance session to scan:', err)
      }
    }

    navigate('/scan')
  }

  // Microphone toggle (Speech Recognition ASR)
  const toggleMicrophone = () => {
    if (isListening) {
      speechRecognitionService.stop()
      setIsListening(false)
      const cleanText = liveTranscript.replace(/^[🎤⏳].*?\.\.\.?\s*/, '').trim()
      if (cleanText.length > 1) {
        handleAnswer(cleanText, 'voice')
      }
      return
    }

    setSpeechError(null)
    setLiveTranscript('')

    const speechLang =
      language === 'hi'
        ? 'hi-IN'
        : language === 'mr'
        ? 'mr-IN'
        : language === 'ta'
        ? 'ta-IN'
        : language === 'bn'
        ? 'bn-IN'
        : language === 'te'
        ? 'te-IN'
        : 'en-IN'

    const started = speechRecognitionService.start(speechLang, {
      onTranscript: (text, isFinal) => {
        setLiveTranscript(text)
        const isStatusMsg = text.startsWith('🎤') || text.startsWith('⏳')
        if (!isStatusMsg && text.trim().length > 0) {
          setManualText(text)
        }

        if (isFinal && !isStatusMsg && text.trim().length > 1) {
          // Auto submit on final clear speech after brief pause
          setTimeout(() => {
            handleAnswer(text, 'voice')
          }, 800)
        }
      },
      onError: (err) => {
        setSpeechError(err)
        setIsListening(false)
        setShowManualInput(true)
      },
      onEnd: () => {
        setIsListening(false)
      },
    })

    if (started) {
      setIsListening(true)
    } else {
      setShowManualInput(true)
    }
  }

  // Quick speech simulator for browser subagent testing
  const simulateVoiceAnswer = (sampleText: string) => {
    setLiveTranscript(sampleText)
    playAudio(sampleText)
    setTimeout(() => {
      handleAnswer(sampleText, 'voice')
    }, 400)
  }

  return (
    <div className="min-h-screen flex flex-col bg-sky-50/50 text-slate-800">
      <KioskHeader
        showBack={true}
        onBack={() => navigate('/')}
        stepNumber={2}
        stepTitle={t('step2Title')}
      />

      {/* ── RED FLAG EMERGENCY SCREEN ─────────────────────────────────── */}
      {activeRedFlag && (
        <RedFlagAlert
          reason={activeRedFlag.reason}
          severity={activeRedFlag.severity}
          redFlagRecordId={activeRedFlag.recordId}
          onDismiss={() => setActiveRedFlag(null)}
        />
      )}

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-4xl mx-auto w-full">
        {/* Patient & OPD Token Bar */}
        {currentPatient && (
          <div className="w-full max-w-3xl flex flex-wrap items-center justify-between gap-3 bg-white border border-teal-200 px-5 py-3 rounded-2xl shadow-xs mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">👤</span>
              <span className="font-bold text-slate-900">{currentPatient.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {activeDepartment === 'ayush' ? (
                <span
                  id="badge-ayush-active"
                  className="font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-xs"
                >
                  <span>🌿</span>
                  <span>आयुष (आयुर्वेद) ओपीडी</span>
                </span>
              ) : (
                <span className="font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1 rounded-xl text-xs sm:text-sm">
                  🏥 सामान्य ओपीडी
                </span>
              )}
              {currentSession?.token_number && (
                <span className="font-bold text-slate-800 bg-slate-100 border border-slate-300 px-3 py-1 rounded-xl text-xs sm:text-sm font-mono">
                  Token: {currentSession.token_number}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Question Container Card */}
        <div className="w-full max-w-3xl bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-teal-100 flex flex-col items-center text-center relative">
          {/* Progress Indicator */}
          {currentTurn?.progress && (
            <div className="w-full flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <span className="text-sm font-bold text-teal-800 bg-teal-50 px-3 py-1 rounded-full">
                {language === 'hi'
                  ? `प्रश्न ${currentTurn.progress.current} (लगभग ${currentTurn.progress.total} में से)`
                  : `Question ${currentTurn.progress.current} of about ${currentTurn.progress.total}`}
              </span>
              <div className="w-32 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-teal-600 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      (currentTurn.progress.current / currentTurn.progress.total) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* AI Interviewer Avatar & Pulse */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-teal-100 text-teal-800 flex items-center justify-center text-3xl sm:text-4xl mb-4 border-2 border-teal-200 shadow-xs">
            🩺
          </div>

          {/* Current Question Text (Large, High Contrast) */}
          <h2
            id="current-question-text"
            className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-teal-950 mb-3 tracking-tight leading-snug"
          >
            {loadingNext
              ? language === 'hi'
                ? 'अगला प्रश्न तैयार किया जा रहा है...'
                : 'Preparing next clinical question...'
              : currentTurn?.question_localized || currentTurn?.question}
          </h2>

          <p className="text-base sm:text-lg font-medium text-slate-500 mb-6">
            {language === 'hi'
              ? 'नीचे दिए गए विकल्प को छुएँ या माइक दबाकर बोलें'
              : 'Tap an option below or press the microphone to speak'}
          </p>

          {/* ── INTERACTIVE OPTIONS (TAP-TO-ANSWER BUTTONS) ──────────────── */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
            {currentTurn?.options.map((opt, idx) => (
              <button
                key={idx}
                id={`btn-opt-answer-${idx}`}
                disabled={loadingNext}
                onClick={() => handleAnswer(opt.label_localized || opt.label, 'touch', opt.value)}
                type="button"
                className={`group flex items-center justify-between p-4 sm:p-5 rounded-2xl bg-white border-2 transition-all duration-150 text-left min-h-[64px] ${
                  loadingNext
                    ? 'opacity-60 cursor-not-allowed border-slate-200'
                    : 'border-teal-200 hover:border-teal-600 hover:bg-teal-50/60 active:scale-98 shadow-xs hover:shadow-md cursor-pointer'
                }`}
              >
                <span className="text-lg sm:text-xl font-bold text-slate-900 group-hover:text-teal-950">
                  {opt.label_localized || opt.label}
                </span>
                <span className="text-teal-600 text-xl font-bold ml-2">➔</span>
              </button>
            ))}
          </div>

          {/* ── BIG MICROPHONE SPEAK BUTTON ─────────────────────────────── */}
          {currentTurn?.allow_free_voice !== false && (
            <div className="w-full flex flex-col items-center pt-2 border-t border-slate-100">
              <div className="relative mb-3">
                <button
                  id="btn-voice-mic"
                  disabled={loadingNext}
                  onClick={toggleMicrophone}
                  type="button"
                  className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-4xl shadow-xl transition-transform active:scale-95 ${
                    loadingNext
                      ? 'opacity-50 cursor-not-allowed bg-slate-400'
                      : isListening
                      ? 'bg-red-600 text-white ring-8 ring-red-200 animate-pulse cursor-pointer'
                      : 'bg-teal-700 hover:bg-teal-800 text-white ring-4 ring-teal-100 cursor-pointer'
                  }`}
                  aria-label="Toggle Microphone"
                  title="Speak your answer"
                >
                  {isListening ? '⏹️' : '🎙️'}
                </button>
              </div>

              <span className="text-base sm:text-lg font-bold text-slate-700 mb-2">
                {isListening
                  ? language === 'hi'
                    ? 'सुन रहे हैं... कृपया बोलें'
                    : 'Listening... please speak now'
                  : language === 'hi'
                  ? 'बोलकर उत्तर देने के लिए माइक दबाएँ'
                  : 'Press mic to answer with your voice'}
              </span>

              {/* Live Speech Feedback Box */}
              {liveTranscript && (
                <div className="w-full bg-sky-50 border-2 border-sky-300 rounded-2xl p-4 mt-2 mb-3 text-left">
                  <span className="text-xs font-bold text-sky-800 block mb-1 uppercase tracking-wider">
                    आवाज़ पहचानी गई (Recognized Voice):
                  </span>
                  <p className="text-xl font-bold text-slate-900">{liveTranscript}</p>
                </div>
              )}

              {/* Speech recognition error or unsupported message */}
              {speechError && (
                <div className="text-amber-800 bg-amber-50 px-4 py-2 rounded-xl text-sm font-semibold mb-2">
                  <span>ℹ️ {speechError}</span>
                </div>
              )}

              {/* Demo voice simulation helper (for browser subagent testing) */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <button
                  id="btn-demo-speak-ayush"
                  type="button"
                  onClick={() =>
                    simulateVoiceAnswer('मुझे वात और जोड़ों में दर्द की तकलीफ़ रहती है')
                  }
                  className="text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-300 cursor-pointer"
                >
                  🌿 नमूना आवाज़: "वात व जोड़ों का दर्द"
                </button>
                <button
                  id="btn-demo-speak-pain"
                  type="button"
                  onClick={() =>
                    simulateVoiceAnswer('मुझे २ दिन से पेट में तेज़ दर्द हो रहा है')
                  }
                  className="text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg border border-teal-200 cursor-pointer"
                >
                  🗣️ नमूना आवाज़: "पेट में तेज़ दर्द"
                </button>
                <button
                  id="btn-demo-speak-chest"
                  type="button"
                  onClick={() =>
                    simulateVoiceAnswer(
                      'सीने में भारी दबाव और सांस लेने में बहुत तकलीफ़ है (Severe chest pain and breathlessness)'
                    )
                  }
                  className="text-xs font-bold text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 cursor-pointer"
                >
                  ⚠️ आपातकालीन आवाज़ (Test Red Flag)
                </button>
              </div>

              {/* Manual keyboard input toggle if speech is quiet */}
              <div className="mt-3">
                {!showManualInput ? (
                  <button
                    type="button"
                    onClick={() => setShowManualInput(true)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    लिखकर उत्तर देना चाहते हैं? (Type with keyboard)
                  </button>
                ) : (
                  <div className="flex gap-2 mt-2 w-full max-w-md">
                    <input
                      id="input-manual-answer"
                      type="text"
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder={
                        language === 'hi' ? 'यहाँ अपना उत्तर लिखें...' : 'Type your answer here...'
                      }
                      className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 text-base focus:border-teal-700 focus:outline-none"
                    />
                    <button
                      id="btn-submit-manual-answer"
                      type="button"
                      onClick={() => handleAnswer(manualText, 'touch')}
                      className="px-4 py-2.5 rounded-xl bg-teal-700 text-white font-bold hover:bg-teal-800 cursor-pointer"
                    >
                      भेजें (Send)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
