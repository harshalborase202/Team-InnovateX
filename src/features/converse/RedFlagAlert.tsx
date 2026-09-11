import React, { useState, useEffect } from 'react'
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

  // Calm audio announcement
  useEffect(() => {
    const audioText =
      language === 'hi'
        ? 'कृपया ध्यान दें। आपके लक्षणों के लिए डॉक्टर से तुरंत प्राथमिकता सलाह की आवश्यकता हो सकती है। कृपया पास के अस्पताल स्टाफ को बताएं।'
        : 'Important health alert: based on your symptoms, you may need immediate priority attention. Please let a hospital staff member know right away.'
    setScreenAudio(audioText)
  }, [language, setScreenAudio])

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
      const ackVoice =
        language === 'hi'
          ? 'कर्मचारी को संदेश भेज दिया गया है। कृपया यहीं बैठें, सहायक आपके पास आ रहे हैं।'
          : 'Hospital staff has been notified. Please stay seated, an assistant is on their way.'
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
            {language === 'hi'
              ? 'प्राथमिकता स्वास्थ्य सहायता / Priority Care Alert'
              : 'Priority Care Assistance Required'}
          </span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
          {language === 'hi'
            ? 'कृपया तुरंत ओपीडी स्टाफ को सूचित करें'
            : 'Please let a staff member know right away'}
        </h2>

        <p className="text-lg sm:text-xl font-medium text-slate-600 mb-6 leading-relaxed max-w-lg mx-auto">
          {language === 'hi'
            ? 'आपके द्वारा बताए गए लक्षणों के आधार पर आपको डॉक्टर से तत्काल प्राथमिकता जांच की आवश्यकता हो सकती है। घबराएँ नहीं, हमारे स्वास्थ्य कर्मी आपकी सहायता के लिए तैयार हैं।'
            : 'Based on the symptoms you described, you may require immediate priority attention from our duty physician. Please do not worry, our team is here to assist.'}
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
              {language === 'hi'
                ? 'ओपीडी ड्यूटी नर्स / स्टाफ को सूचित कर दिया गया है। वे तुरंत आपके पास पहुँच रहे हैं।'
                : 'Staff notified! A nursing assistant is on the way to your kiosk.'}
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
                {language === 'hi' ? 'स्टाफ को अभी सूचित करें (Notify Staff Now)' : 'Notify Staff Now'}
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
            {language === 'hi'
              ? 'बातचीत जारी रखें (Continue interview)'
              : 'Continue interview with doctor'}
          </button>
        </div>
      </div>
    </div>
  )
}
