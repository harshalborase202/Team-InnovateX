import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKiosk } from '../../context/KioskContext'
import { supabase } from '../../lib/supabase'

interface ScreenConsentProps {
  onBack: () => void
}

export const ScreenConsent: React.FC<ScreenConsentProps> = ({ onBack }) => {
  const navigate = useNavigate()
  const { t, language, setScreenAudio, playAudio, currentPatient, currentSession, setCurrentSession } = useKiosk()

  const [showExplainModal, setShowExplainModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Automatically read consent text aloud on mount
  useEffect(() => {
    const consentText = t('consentAudioText')
    setScreenAudio(consentText)
  }, [t, setScreenAudio])

  // Handle "Explain More"
  const handleExplainMore = () => {
    setShowExplainModal(true)
    const explainText = `${t('explainTitle')}. ${t('explainText1')}. ${t('explainText2')}. ${t('explainText3')}`
    playAudio(explainText)
  }

  // Handle "I Agree"
  const handleAgree = async () => {
    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const sessionId = currentSession?.id

      if (!sessionId) {
        // If no active session was found, navigate gracefully
        navigate('/converse')
        return
      }

      // Step 1: Insert row into consents table
      const { error: consentError } = await supabase.from('consents').insert({
        session_id: sessionId,
        consent_type: 'opd_examination_and_voice',
        granted: true,
        language_code: language,
        granted_at: new Date().toISOString(),
      })

      if (consentError) {
        console.error('Consent insert error:', consentError)
      }

      // Step 2: Update session status to "converse"
      const { data: updatedSession, error: sessionUpdateError } = await supabase
        .from('sessions')
        .update({
          status: 'converse',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single()

      if (sessionUpdateError) {
        console.error('Session update error:', sessionUpdateError)
      } else if (updatedSession) {
        setCurrentSession(updatedSession)
      }

      // Step 3: Record in audit log
      await supabase.from('audit_log').insert({
        session_id: sessionId,
        actor: 'kiosk_patient',
        action: 'CONSENT_GRANTED',
        details: {
          language,
          patient_name: currentPatient?.name,
          timestamp: new Date().toISOString(),
        },
      })

      // Step 4: Advance to Step 2 Converse
      navigate('/converse')
    } catch (err: any) {
      console.error('Consent error:', err)
      setErrorMsg(err.message || 'सहमति दर्ज करने में समस्या आई।')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full">
      <div className="w-full max-w-3xl bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-teal-100 flex flex-col items-center text-center">
        {/* Patient Greeting & Token */}
        {currentPatient && (
          <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-900 px-4 py-1.5 rounded-full text-sm font-bold mb-4">
            <span>👤</span>
            <span>{currentPatient.name}</span>
            {currentSession?.token_number && (
              <span className="bg-teal-700 text-white px-2 py-0.5 rounded-md text-xs">
                {currentSession.token_number}
              </span>
            )}
          </div>
        )}

        {/* Big Relatable Hospital Shield Icon */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-teal-50 border-2 border-teal-200 text-teal-800 flex items-center justify-center text-4xl sm:text-5xl mb-5 shadow-xs">
          🛡️
        </div>

        {/* Title & Subtitle */}
        <h2 className="text-3xl sm:text-4xl font-extrabold text-teal-950 mb-2 tracking-tight">
          {t('consentTitle')}
        </h2>
        <p className="text-lg sm:text-xl font-medium text-slate-500 mb-6">
          {t('consentSubtitle')}
        </p>

        {/* Large Simple Reassurance Points */}
        <div className="w-full bg-sky-50/70 border-2 border-sky-100 rounded-2xl p-5 sm:p-6 mb-8 text-left space-y-4">
          <div className="flex items-start gap-4">
            <span className="text-2xl sm:text-3xl shrink-0 mt-0.5">🩺</span>
            <p className="text-lg sm:text-xl font-semibold text-slate-800">
              {t('consentPoint1')}
            </p>
          </div>
          <div className="flex items-start gap-4">
            <span className="text-2xl sm:text-3xl shrink-0 mt-0.5">📑</span>
            <p className="text-lg sm:text-xl font-semibold text-slate-800">
              {t('consentPoint2')}
            </p>
          </div>
          <div className="flex items-start gap-4">
            <span className="text-2xl sm:text-3xl shrink-0 mt-0.5">🔒</span>
            <p className="text-lg sm:text-xl font-semibold text-slate-800">
              {t('consentPoint3')}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="w-full p-4 mb-6 rounded-2xl bg-red-50 border border-red-200 text-red-800 font-semibold text-base flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Two Large Action Buttons (Min 64px tall, high contrast) */}
        <div className="w-full flex flex-col gap-4">
          {/* Button 1: I Agree */}
          <button
            id="btn-consent-agree"
            onClick={handleAgree}
            disabled={isSubmitting}
            type="button"
            className="w-full py-5 px-8 rounded-2xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xl sm:text-2xl shadow-lg hover:shadow-xl active:scale-98 transition-all duration-150 flex items-center justify-center gap-3 cursor-pointer min-h-[72px]"
          >
            <span>✓</span>
            <span>{isSubmitting ? t('recordingConsent') : t('btnAgree')}</span>
          </button>

          {/* Button 2: Explain More */}
          <button
            id="btn-consent-explain"
            onClick={handleExplainMore}
            type="button"
            className="w-full py-4 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-lg border-2 border-slate-300 active:scale-98 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer min-h-[64px]"
          >
            <span>❓</span>
            <span>{t('btnExplain')}</span>
          </button>
        </div>

        {/* Back Link */}
        <div className="mt-6">
          <button
            onClick={onBack}
            type="button"
            className="text-slate-500 hover:text-slate-700 text-base font-medium underline cursor-pointer"
          >
            ← {t('back')}
          </button>
        </div>
      </div>

      {/* ── PLAIN-LANGUAGE EXPLANATION MODAL ─────────────────────────────── */}
      {showExplainModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl border-2 border-teal-200 text-left">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-3xl">ℹ️</span>
                <h3 className="text-2xl font-bold text-teal-950">
                  {t('explainTitle')}
                </h3>
              </div>
              <button
                onClick={() => setShowExplainModal(false)}
                type="button"
                className="text-slate-400 hover:text-slate-700 text-2xl font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-slate-700 text-lg font-medium mb-6">
              <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-100 flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">👨‍⚕️</span>
                <p>{t('explainText1')}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-100 flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">🔒</span>
                <p>{t('explainText2')}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">🚶</span>
                <p>{t('explainText3')}</p>
              </div>
            </div>

            <button
              id="btn-modal-agree"
              onClick={() => {
                setShowExplainModal(false)
                handleAgree()
              }}
              type="button"
              className="w-full py-4 px-6 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xl shadow-md cursor-pointer min-h-[64px]"
            >
              ✓ {t('btnUnderstoodAgree')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
