import React, { useState, useEffect, useCallback } from 'react'
import { useKiosk } from '../../context/KioskContext'
import { supabase } from '../../lib/supabase'

interface RedFlagAlertProps {
  reason: string | null
  severity: 'critical' | 'high' | 'medium' | null
  redFlagRecordId?: string | null
  onDismiss: () => void
}

export const RedFlagAlert: React.FC<RedFlagAlertProps> = ({
  reason,
  redFlagRecordId,
  onDismiss,
}) => {
  const { language, setScreenAudio, playAudio } = useKiosk()
  const [notified, setNotified] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  // Multi-lingual localization helper for all 6 supported languages
  const locAlert = useCallback(
    (texts: { en: string; hi: string; mr: string; ta?: string; bn?: string; te?: string }) => {
      const target = texts[language]
      if (target) return target
      if (language === 'mr') return texts.mr
      if (language === 'hi') return texts.hi
      return texts.en
    },
    [language]
  )

  // Calm audio announcement in user's selected language on screen mount
  useEffect(() => {
    const audioText = locAlert({
      en: 'Important health alert: based on your symptoms, you may need immediate priority attention. Please let a hospital staff member know right away.',
      hi: 'कृपया ध्यान दें। आपके लक्षणों के आधार पर आपको तुरंत डॉक्टर से प्राथमिकता सलाह की आवश्यकता हो सकती है। कृपया ओपीडी स्टाफ को सूचित करें।',
      mr: 'कृपया लक्ष द्या. आपल्या लक्षणांच्या आधारे तुम्हाला तात्काळ डॉक्टरांच्या मदतीची गरज भासू शकते. कृपया ओपीडी कर्मचाऱ्यांना कळवा.',
      ta: 'தயவுசெய்து கவனிக்கவும். உங்கள் அறிகுறிகளின் அடிப்படையில் உங்களுக்கு உடனடி மருத்துவர் உதவி தேவைப்படலாம்.',
      bn: 'অনুগ্রহ করে মনোযোগ দিন। আপনার উপসর্গের ওপর ভিত্তি করে জরুরি ডাক্তারী সহায়তার প্রয়োজন হতে পারে।',
      te: 'దయచేసి గమనించండి. మీ లక్షణాల ఆధారంగా మీకు తక్షణ వైద్య సహాయం అవసరం కావచ్చు.',
    })
    setScreenAudio(audioText)
  }, [language, locAlert, setScreenAudio])

  const handleNotifyStaff = async () => {
    setIsUpdating(true)
    try {
      if (redFlagRecordId) {
        await supabase
          .from('red_flags')
          .update({
            acknowledged_at: new Date().toISOString(),
          })
          .eq('id', redFlagRecordId)
      }
      setNotified(true)
      const ackVoice = locAlert({
        en: 'Hospital staff has been notified. Please stay seated, an assistant is on their way.',
        hi: 'ओपीडी कर्मचारियो को संदेश भेज दिया गया है। कृपया यहीं बैठें, सहायक आपके पास आ रहे हैं।',
        mr: 'आरोग्य कर्मचाऱ्यांना संदेश पाठवला आहे. कृपया येथेच बसा, सहाय्यक आपल्याकडे येत आहेत.',
        ta: 'மருத்துவமனை ஊழியர்களுக்கு தெரிவிக்கப்பட்டுள்ளது. தயவுசெய்து அமர்ந்திருக்கவும்.',
        bn: 'হাসপাতালের কর্মীদের জানানো হয়েছে। অনুগ্রহ করে বসুন, সহকারী আসছেন।',
        te: 'సిబ్బందికి సమాచారం అందించబడింది. దయచేసి కూర్చోండి, సహాయకుడు వస్తున్నారు.',
      })
      playAudio(ackVoice)
    } catch (err) {
      console.error('Red flag acknowledge error:', err)
      setNotified(true)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl p-6 sm:p-10 max-w-2xl w-full shadow-2xl border-3 border-amber-400 text-center">
        {/* Calm Attention Badge */}
        <div className="w-20 h-20 rounded-3xl bg-amber-100 text-amber-900 flex items-center justify-center text-4xl mx-auto mb-4 border-2 border-amber-300">
          🏥
        </div>

        <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-900 font-bold px-4 py-1.5 rounded-full text-sm mb-3 border border-amber-200">
          <span>⚠️</span>
          <span>
            {locAlert({
              en: 'Priority Care Assistance Required',
              hi: 'प्राथमिकता स्वास्थ्य सहायता / Priority Care Alert',
              mr: 'प्राधान्य आरोग्य सेवा / Priority Care Alert',
              ta: 'முன்னுரிமை பராமரிப்பு விழிப்புணர்வு',
              bn: 'জরুরী স্বাস্থ্য সচেতনতা',
              te: 'ప్రాధాన్యత ఆరోగ్య హెచ్చరిక',
            })}
          </span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
          {locAlert({
            en: 'Please let a staff member know right away',
            hi: 'कृपया तुरंत ओपीडी स्टाफ को सूचित करें',
            mr: 'कृपया ताबडतोब ओपीडी कर्मचाऱ्यांना कळवा',
            ta: 'தயவுசெய்து உடனடியாக பணியாளரிடம் தெரிவிக்கவும்',
            bn: 'অনুগ্রহ করে অবিলম্বে কর্মীদের জানান',
            te: 'దయచేసి వెంటనే సిబ్బందికి తెలియజేయండి',
          })}
        </h2>

        <p className="text-lg sm:text-xl font-medium text-slate-600 mb-6 leading-relaxed max-w-lg mx-auto">
          {locAlert({
            en: 'Based on the symptoms you described, you may require immediate priority attention from our duty physician. Please do not worry, our team is here to assist.',
            hi: 'आपके द्वारा बताए गए लक्षणों के आधार पर आपको डॉक्टर से तत्काल प्राथमिकता जांच की आवश्यकता हो सकती है। घबराएँ नहीं, हमारी स्वास्थ्य टीम आपकी सहायता के लिए तैयार है।',
            mr: 'आपण सांगितलेल्या लक्षणांवरून तुम्हाला डॉक्टरांकडून तात्काळ प्राधान्य तपासणीची गरज भासू शकते. घाबरू नका, आमचे आरोग्य पथक मदतीसाठी तयार आहे.',
            ta: 'நீங்கள் விவரித்த அறிகுறிகளின் அடிப்படையில், உங்களுக்கு உடனடி முன்னுரிமை கவனிப்பு தேவைப்படலாம்.',
            bn: 'আপনার বর্ণিত উপসর্গের ভিত্তিতে আপনার অবিলম্বে অগ্রাধিকার মূল্যায়নের প্রয়োজন হতে পারে।',
            te: 'మీరు చెప్పిన లక్షణాల ఆధారంగా మీకు తక్షణ ప్రాధాన్యత మూల్యాంకనం అవసరం కావచ్చు.',
          })}
        </p>

        {/* Clinical Flag Reason Box */}
        {reason && (
          <div className="bg-amber-50/80 border border-amber-300 rounded-2xl p-4 mb-6 text-left">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 block mb-1">
              Clinical Trigger Identified:
            </span>
            <span className="text-base font-semibold text-slate-800">{reason}</span>
          </div>
        )}

        {/* Status Notification Message */}
        {notified ? (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 mb-6 text-emerald-900 font-bold text-lg flex items-center justify-center gap-3">
            <span className="text-2xl">✓</span>
            <span>
              {locAlert({
                en: 'Staff notified! A nursing assistant is on the way to your kiosk.',
                hi: 'ओपीडी ड्यूटी नर्स / स्टाफ को सूचित कर दिया गया है। वे तुरंत आपके पास पहुँच रहे हैं।',
                mr: 'ओपीडी कर्मचारी / नर्स यांना कळवले आहे. ते ताबडतोब आपल्याकडे येत आहेत.',
                ta: 'ஊழியர்களுக்கு தெரிவிக்கப்பட்டது! உதவி வந்து கொண்டிருக்கிறது.',
                bn: 'কর্মীদের জানানো হয়েছে! সহকারী আপনার কাছে আসছেন।',
                te: 'సిబ్బందికి సమాచారం అందింది! సహాయకుడు వస్తున్నారు.',
              })}
            </span>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <button
              id="btn-notify-staff"
              onClick={handleNotifyStaff}
              disabled={isUpdating}
              type="button"
              className="w-full py-5 px-8 rounded-2xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-extrabold text-2xl shadow-lg hover:shadow-xl active:scale-98 transition-all duration-150 flex items-center justify-center gap-3 cursor-pointer min-h-[72px]"
            >
              <span>🔔</span>
              <span>
                {locAlert({
                  en: 'Notify Staff Now 🔔',
                  hi: 'स्टाफ को अभी सूचित करें 🔔',
                  mr: 'कर्मचाऱ्यांना आता कळवा 🔔',
                  ta: 'ஊழியர்களுக்கு இப்போது தெரிவிக்கவும் 🔔',
                  bn: 'কর্মীদের এখনই জানান 🔔',
                  te: 'సిబ్బందికి ఇప్పుడే తెలియజేయండి 🔔',
                })}
              </span>
            </button>
          </div>
        )}

        {/* Option to continue or return */}
        <div className="flex justify-center gap-4 pt-2">
          <button
            id="btn-dismiss-red-flag"
            onClick={onDismiss}
            type="button"
            className="text-slate-600 hover:text-slate-900 text-base font-semibold underline px-4 py-2 cursor-pointer"
          >
            {locAlert({
              en: 'Continue interview with doctor ➔',
              hi: 'बातचीत जारी रखें (Continue interview) ➔',
              mr: 'संवाद सुरू ठेवा (Continue interview) ➔',
              ta: 'நேர்காணலைத் தொடரவும் ➔',
              bn: 'কথোপকথন চালিয়ে যান ➔',
              te: 'సంభాషణను కొనసాగించండి ➔',
            })}
          </button>
        </div>
      </div>
    </div>
  )
}
