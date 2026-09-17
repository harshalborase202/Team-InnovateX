import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKiosk } from '../../context/KioskContext'
import { KioskHeader } from '../../components/KioskHeader'
import { generateAndSaveSummary } from '../../services/summaryService'
import { supabase } from '../../lib/supabase'

export const ScreenSummary: React.FC = () => {
  const navigate = useNavigate()
  const {
    language,
    currentPatient,
    setCurrentPatient,
    currentSession,
    setCurrentSession,
    setScreenAudio,
    playAudio,
  } = useKiosk()

  const [tokenNumber, setTokenNumber] = useState<string>('OPD-101')
  const [departmentName, setDepartmentName] = useState<string>('General OPD')
  const initialTriggerDone = useRef(false)

  // Calming audio confirmation on screen load
  useEffect(() => {
    const audioText =
      language === 'mr'
        ? 'धन्यवाद! तुमची आरोग्य माहिती यशस्वीरीत्या नोंदवून घेण्यात आली आहे. डॉक्टर लवकरच त्याची पाहणी करतील. कृपया आपला टोकन नंबर लक्षात ठेवा आणि पाचारण होईपर्यंत थांबा.'
        : language === 'hi'
        ? 'धन्यवाद! आपकी स्वास्थ्य जानकारी सफलतापूर्वक दर्ज कर ली गई है। डॉक्टर जल्द ही इसकी समीक्षा करेंगे। कृपया अपना टोकन नंबर नोट करें और बुलाए जाने की प्रतीक्षा करें।'
        : 'Thank you, your information has been recorded and the doctor will review it shortly. Please take your token number and wait to be called.'

    setScreenAudio(audioText)
  }, [language, setScreenAudio])

  // Trigger backend summary generation and session finalize
  useEffect(() => {
    if (initialTriggerDone.current) return
    initialTriggerDone.current = true

    const finalizeAndGenerate = async () => {
      let activeSession = currentSession

      // Auto-recover session if refreshed
      if (!activeSession) {
        const { data: latest } = await supabase
          .from('sessions')
          .select('*, patients(*)')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latest) {
          activeSession = latest
          setCurrentSession(latest)
          if (latest.patients) setCurrentPatient(latest.patients)
        }
      }

      if (activeSession) {
        setTokenNumber(activeSession.token_number || 'OPD-101')
        setDepartmentName(
          activeSession.department === 'ayush'
            ? language === 'mr'
              ? 'आयुष (आयुर्वेद) ओपीडी'
              : language === 'hi'
              ? 'आयुष (आयुर्वेद) ओपीडी'
              : 'AYUSH (Ayurveda) OPD'
            : language === 'mr'
            ? 'सामान्य चिकित्सा ओपीडी'
            : language === 'hi'
            ? 'सामान्य चिकित्सा ओपीडी'
            : 'General Medicine OPD'
        )

        // 1. Trigger Edge Function generate-summary
        try {
          await generateAndSaveSummary(activeSession.id)
        } catch (err) {
          console.warn('Background summary generation notice:', err)
        }

        // 2. Mark session status as done or ready for consult
        try {
          await supabase
            .from('sessions')
            .update({
              status: 'consult',
              updated_at: new Date().toISOString(),
            })
            .eq('id', activeSession.id)
        } catch (sessErr) {
          console.warn('Could not update session status:', sessErr)
        }
      }
    }

    finalizeAndGenerate()
  }, [currentSession, language, setCurrentPatient, setCurrentSession])

  // Reset kiosk for the next walk-in patient
  const handleResetForNextPatient = () => {
    setCurrentPatient(null)
    setCurrentSession(null)
    sessionStorage.removeItem('medikiosk_patient')
    sessionStorage.removeItem('medikiosk_session')
    navigate('/kiosk')
  }

  // Helper for multi-lingual localization
  const locSummary = (texts: { en: string; hi: string; mr: string; ta?: string; bn?: string; te?: string }) => {
    const target = texts[language]
    if (target) return target
    if (language === 'mr') return texts.mr
    if (language === 'hi') return texts.hi
    return texts.en
  }

  // Quick jump to physician consultation view
  const handleGoToClinician = () => {
    navigate('/clinician')
  }

  return (
    <div className="min-h-screen flex flex-col bg-sky-50/50 text-slate-800">
      <KioskHeader
        showBack={false}
        stepNumber={4}
        stepTitle={locSummary({
          en: 'Step 4: Check-in Complete',
          hi: 'चरण 4: पंजीकरण पूर्ण',
          mr: 'पायरी ४: नोंदणी पूर्ण',
          ta: 'படி 4: பதிவு முடிந்தது',
          bn: 'ধাপ ৪: নিবন্ধন সম্পূর্ণ',
          te: 'దశ 4: నమోదు పూర్తయింది',
        })}
      />

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-3xl mx-auto w-full text-center">
        {/* Calming Success Icon */}
        <div className="relative mb-6">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-5xl sm:text-6xl border-4 border-emerald-200 shadow-xl mx-auto animate-bounce-short">
            ✓
          </div>
          <div className="absolute -bottom-2 right-1/2 translate-x-1/2 bg-emerald-800 text-white text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
            {locSummary({ en: 'Recorded', hi: 'सफल', mr: 'यशस्वी', ta: 'பதிவு செய்யப்பட்டது', bn: 'রেকর্ড করা হয়েছে', te: 'నమోదైంది' })}
          </div>
        </div>

        {/* Calm Primary Heading */}
        <h2
          id="summary-heading"
          className="text-3xl sm:text-4xl lg:text-5xl font-black text-teal-950 mb-3 tracking-tight leading-tight"
        >
          {locSummary({
            en: 'All Done, Thank You!',
            hi: 'आपका स्वास्थ्य विवरण दर्ज कर लिया गया है',
            mr: 'तुमचा आरोग्य तपशील नोंदवून घेण्यात आला आहे',
            ta: 'அனைத்தும் முடிந்தது, நன்றி!',
            bn: 'সব সম্পন্ন, আপনাকে ধন্যবাদ!',
            te: 'అంతా పూర్తయింది, ధన్యవాదాలు!',
          })}
        </h2>

        {/* Reassurance Message (No clinical jargon) */}
        <p className="text-lg sm:text-xl font-medium text-slate-600 max-w-xl mx-auto mb-8 leading-relaxed">
          {locSummary({
            en: 'Your information has been recorded and the doctor will review it shortly. You are ready — please wait in the lounge to be called.',
            hi: 'डॉक्टर जल्द ही आपके विवरण की समीक्षा करेंगे। आप पूरी तरह तैयार हैं, कृपया अपनी बारी आने तक प्रतीक्षा कक्ष में बैठें।',
            mr: 'डॉक्टर लवकरच आपल्या तपशिलांची पाहणी करतील. आपण पूर्णपणे तयार आहात, कृपया आपली पाळी येईपर्यंत प्रतीक्षा कक्षात बसा.',
            ta: 'உங்கள் தகவல்கள் பதிவு செய்யப்பட்டுள்ளன. மருத்துவர் விரைவில் மதிப்பாய்வு செய்வார். காத்திருக்கவும்.',
            bn: 'আপনার তথ্য রেকর্ড করা হয়েছে। ডাক্তার শীঘ্রই এটি পর্যালোচনা করবেন। অনুগ্রহ করে অপেক্ষা করুন।',
            te: 'మీ సమాచారం నమోదైంది. వైద్యులు త్వరలోనే పరిశీలిస్తారు. వేచి ఉండండి.',
          })}
        </p>

        {/* ── OPD TOKEN & ROUTING CARD ─────────────────────────────────── */}
        <div
          id="card-token-ticket"
          className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border-3 border-teal-200 mb-8 relative overflow-hidden text-left"
        >
          {/* Top Ticket Header */}
          <div className="flex items-center justify-between pb-4 border-b-2 border-dashed border-slate-200 mb-5">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                {locSummary({ en: 'OPD Token Number', hi: 'ओपीडी टोकन नंबर', mr: 'ओपीडी टोकन क्रमांक', ta: 'OPD டோக்கன் எண்', bn: 'ওপিডি টোকেন নম্বর', te: 'OPD టోకెన్ సంఖ్య' })}
              </span>
              <span
                id="text-token-number"
                className="text-4xl sm:text-5xl font-black text-teal-900 tracking-tight font-mono"
              >
                {tokenNumber}
              </span>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-3xl">
              🏥
            </div>
          </div>

          {/* Ticket Details */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-sm sm:text-base">
              <span className="text-slate-500 font-semibold">
                {locSummary({ en: 'Patient Name:', hi: 'मरीज़ का नाम:', mr: 'रुग्णाचे नाव:', ta: 'நோயாளி பெயர்:', bn: 'রোগীর নাম:', te: 'రోగి పేరు:' })}
              </span>
              <span className="font-extrabold text-slate-900">
                {currentPatient?.name || locSummary({ en: 'Walk-in Patient', hi: 'पंजीकृत मरीज', mr: 'नोंदणीकृत रुग्ण', ta: 'நோயாளி', bn: 'রোগী', te: 'రోగి' })}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm sm:text-base">
              <span className="text-slate-500 font-semibold">
                {locSummary({ en: 'Department:', hi: 'ओपीडी विभाग:', mr: 'ओपीडी विभाग:', ta: 'துறை:', bn: 'বিভাগ:', te: 'విభాగం:' })}
              </span>
              <span className="font-bold text-teal-800 bg-teal-50 px-3 py-1 rounded-xl text-xs sm:text-sm border border-teal-200">
                {departmentName}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm sm:text-base">
              <span className="text-slate-500 font-semibold">
                {locSummary({ en: 'Assigned Room:', hi: 'कक्ष / रूम नंबर:', mr: 'कक्ष / रूम नंबर:', ta: 'அறை எண்:', bn: 'কক্ষ নম্বর:', te: 'కేటాయించిన గది:' })}
              </span>
              <span className="font-bold text-emerald-900 bg-emerald-50 px-3 py-1 rounded-xl text-xs sm:text-sm border border-emerald-200">
                {locSummary({
                  en: 'Room No. 4 • Dr. Sharma',
                  hi: 'कमरा नं. ४ • डॉ. शर्मा',
                  mr: 'खोली क्र. ४ • डॉ. शर्मा',
                  ta: 'அறை எண் 4 • டாக்டர் சர்மா',
                  bn: 'কক্ষ নং ৪ • ডাঃ শর্মা',
                  te: 'గది సంఖ్య 4 • డాక్టర్ శర్మ',
                })}
              </span>
            </div>
          </div>

          {/* Calming footer note inside ticket */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="text-base">🔔</span>
            <span>
              {locSummary({
                en: 'Watch the OPD screen for your token call.',
                hi: 'स्क्रीन पर आपका टोकन नंबर आने पर डॉक्टर के कक्ष में जाएँ',
                mr: 'स्क्रीनवर आपला टोकन क्रमांक आल्यावर डॉक्टरांच्या कक्षात जा',
                ta: 'உங்கள் டோக்கன் அழைப்பிற்காக OPD திரையைப் பார்க்கவும்.',
                bn: 'আপনার টোকেন কলের জন্য ওপিডি স্ক্রীন দেখুন।',
                te: 'మీ టోకెన్ పిలుపు కోసం OPD స్క్రీన్‌ను చూడండి.',
              })}
            </span>
          </div>
        </div>

        {/* Audio Replay helper */}
        <button
          type="button"
          onClick={() =>
            playAudio(
              locSummary({
                en: 'Thank you, your information has been recorded. Please wait to be called.',
                hi: 'धन्यवाद! आपकी जानकारी दर्ज कर ली गई है। कृपया बुलाए जाने की प्रतीक्षा करें।',
                mr: 'धन्यवाद! तुमची माहिती नोंदवली आहे. कृपया पाचारण होईपर्यंत थांबा.',
                ta: 'நன்றி, உங்கள் தகவல் பதிவு செய்யப்பட்டது.',
                bn: 'ধন্যবাদ, আপনার তথ্য রেকর্ড করা হয়েছে।',
                te: 'ధన్యవాదాలు, మీ సమాచారం నమోదైంది.',
              })
            )
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 mb-6 shadow-xs cursor-pointer"
        >
          <span>🔊</span>
          <span>{locSummary({ en: 'Listen Again', hi: 'आवाज़ दोबारा सुनें', mr: 'आवाज पुन्हा ऐका', ta: 'மீண்டும் கேளுங்கள்', bn: 'আবার শুনুন', te: 'మళ్లీ వినండి' })}</span>
        </button>

        {/* ── ACTION BUTTONS ───────────────────────────────────────────── */}
        <div className="w-full max-w-md flex flex-col gap-3">
          {/* Finish & Reset for Next Patient Button */}
          <button
            id="btn-finish-kiosk"
            type="button"
            onClick={handleResetForNextPatient}
            className="w-full py-4 sm:py-5 px-6 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xl shadow-lg hover:shadow-xl active:scale-98 transition-all flex items-center justify-center gap-3 cursor-pointer min-h-[64px]"
          >
            <span>{locSummary({ en: 'Done • Next Patient', hi: 'समाप्त • नया मरीज़', mr: 'पूर्ण • पुढील रुग्ण', ta: 'முடிந்தது • அடுத்த நோயாளி', bn: 'সম্পন্ন • পরবর্তী রোগী', te: 'పూర్తయింది • తదుపరి రోగి' })}</span>
            <span className="text-2xl">➔</span>
          </button>

          {/* Clinician Consult Route Direct Access (Doctor view) */}
          <button
            id="btn-goto-clinician"
            type="button"
            onClick={handleGoToClinician}
            className="w-full py-3 px-4 rounded-xl border-2 border-teal-300 bg-teal-50/50 hover:bg-teal-100 text-teal-900 font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <span>🩺</span>
            <span>
              {locSummary({
                en: 'Open Clinician Consult View (/clinician)',
                hi: 'डॉक्टर दृश्य खोलें (Open Clinician Consult View)',
                mr: 'डॉक्टर दृश्य उघडा (Open Clinician View)',
                ta: 'மருத்துவர் பார்வையைத் திறக்கவும்',
                bn: 'ডাক্তারের দৃশ্য খুলুন',
                te: 'వైద్యుల వ్యూ తెరవండి',
              })}
            </span>
          </button>
        </div>
      </main>
    </div>
  )
}
