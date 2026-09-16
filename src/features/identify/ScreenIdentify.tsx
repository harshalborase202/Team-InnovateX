import React, { useState, useEffect } from 'react'
import { useKiosk } from '../../context/KioskContext'
import { supabase } from '../../lib/supabase'
import { Patient } from '../../types/database'

interface ScreenIdentifyProps {
  onNext: () => void
  onBack: () => void
}

type IdentifyMode = 'menu' | 'abha' | 'aadhaar' | 'new_patient'

export const ScreenIdentify: React.FC<ScreenIdentifyProps> = ({ onNext, onBack }) => {
  const {
    t,
    language,
    department,
    setDepartment,
    setScreenAudio,
    playAudio,
    setCurrentPatient,
    setCurrentSession,
  } = useKiosk()
  const [mode, setMode] = useState<IdentifyMode>('menu')
  const [showStaffSetup, setShowStaffSetup] = useState(false)

  // Form states
  const [abhaInput, setAbhaInput] = useState('')
  const [aadhaarInput, setAadhaarInput] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male')

  // Validation & Submission
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Trigger audio prompt on mode change
  useEffect(() => {
    if (mode === 'menu') {
      setScreenAudio(`${t('identifyPrompt')}. ${t('identifySub')}`)
    } else if (mode === 'abha') {
      setScreenAudio(t('abhaAudioPrompt'))
    } else if (mode === 'aadhaar') {
      setScreenAudio(t('aadhaarAudioPrompt'))
    } else if (mode === 'new_patient') {
      setScreenAudio(t('newRegAudioPrompt'))
    }
  }, [mode, t, setScreenAudio])

  // ABHA formatting: XX-XXXX-XXXX-XXXX
  const handleAbhaChange = (val: string) => {
    const raw = val.replace(/[^\d]/g, '').slice(0, 14)
    let formatted = ''
    for (let i = 0; i < raw.length; i++) {
      if (i === 2 || i === 6 || i === 10) formatted += '-'
      formatted += raw[i]
    }
    setAbhaInput(formatted)
    setErrorMsg(null)
  }

  // Aadhaar formatting: XXXX XXXX XXXX
  const handleAadhaarChange = (val: string) => {
    const raw = val.replace(/[^\d]/g, '').slice(0, 12)
    let formatted = ''
    for (let i = 0; i < raw.length; i++) {
      if (i === 4 || i === 8) formatted += ' '
      formatted += raw[i]
    }
    setAadhaarInput(formatted)
    setErrorMsg(null)
  }

  // Core submission handler for all 3 modes
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMsg(null)

    let patientQueryData: Partial<Patient> = {
      preferred_language: language,
    }

    if (mode === 'abha') {
      const rawAbha = abhaInput.replace(/[^\d]/g, '')
      if (rawAbha.length !== 14) {
        setErrorMsg(t('abhaInvalid'))
        playAudio(t('abhaInvalid'))
        return
      }
      patientQueryData.abha_id = abhaInput
      patientQueryData.name = `ABHA Patient (${abhaInput.slice(-4)})`
    } else if (mode === 'aadhaar') {
      const rawAadhaar = aadhaarInput.replace(/[^\d]/g, '')
      if (rawAadhaar.length !== 12) {
        setErrorMsg(t('aadhaarInvalid'))
        playAudio(t('aadhaarInvalid'))
        return
      }
      // Store masked / hashed ref for privacy
      patientQueryData.aadhaar_ref = `AADHAAR-XXXX-XXXX-${rawAadhaar.slice(-4)}`
      patientQueryData.name = `Aadhaar Patient (...${rawAadhaar.slice(-4)})`
    } else if (mode === 'new_patient') {
      if (!name.trim()) {
        setErrorMsg(t('nameRequired'))
        playAudio(t('nameRequired'))
        return
      }
      const rawPhone = phone.replace(/[^\d]/g, '')
      if (rawPhone.length !== 10) {
        setErrorMsg(t('phoneInvalid'))
        playAudio(t('phoneInvalid'))
        return
      }
      const numAge = parseInt(age, 10)
      if (isNaN(numAge) || numAge < 1 || numAge > 120) {
        setErrorMsg(t('ageInvalid'))
        playAudio(t('ageInvalid'))
        return
      }

      // Calculate approximate DOB from age
      const currentYear = new Date().getFullYear()
      const approxBirthYear = currentYear - numAge
      const approxDob = `${approxBirthYear}-01-01`

      patientQueryData.name = name.trim()
      patientQueryData.phone_number = rawPhone
      patientQueryData.dob = approxDob
      patientQueryData.gender = gender
    }

    setIsSubmitting(true)

    try {
      let patientRecord: Patient | null = null

      // Step 1: Check if patient already exists in Supabase
      if (patientQueryData.abha_id) {
        const { data: existing } = await supabase
          .from('patients')
          .select('*')
          .eq('abha_id', patientQueryData.abha_id)
          .maybeSingle()
        if (existing) patientRecord = existing
      } else if (patientQueryData.aadhaar_ref) {
        const { data: existing } = await supabase
          .from('patients')
          .select('*')
          .eq('aadhaar_ref', patientQueryData.aadhaar_ref)
          .maybeSingle()
        if (existing) patientRecord = existing
      } else if (patientQueryData.phone_number) {
        const { data: existing } = await supabase
          .from('patients')
          .select('*')
          .eq('phone_number', patientQueryData.phone_number)
          .maybeSingle()
        if (existing) patientRecord = existing
      }

      // Step 2: If not found, insert new patient record
      if (!patientRecord) {
        const { data: inserted, error: insertError } = await supabase
          .from('patients')
          .insert({
            name: patientQueryData.name || 'Patient',
            preferred_language: language,
            abha_id: patientQueryData.abha_id || null,
            aadhaar_ref: patientQueryData.aadhaar_ref || null,
            phone_number: patientQueryData.phone_number || null,
            dob: patientQueryData.dob || null,
            gender: patientQueryData.gender || null,
          })
          .select()
          .single()

        if (insertError) {
          console.error('Patient insert error:', insertError)
          throw new Error(insertError.message)
        }
        patientRecord = inserted
      }

      if (!patientRecord) {
        throw new Error('Could not establish patient record')
      }

      setCurrentPatient(patientRecord)

      // Step 3: Create a new row in sessions with status "identify"
      const tokenPrefix = department === 'ayush' ? 'AYUSH' : 'OPD'
      const tokenNumber = `${tokenPrefix}-${Math.floor(100 + Math.random() * 900)}`
      const { data: sessionRecord, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          patient_id: patientRecord.id,
          kiosk_id: 'KIOSK-OPD-01',
          department: department || 'general_medicine',
          token_number: tokenNumber,
          status: 'identify',
          started_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (sessionError) {
        console.error('Session insert error:', sessionError)
        throw new Error(sessionError.message)
      }

      setCurrentSession(sessionRecord)

      // Step 4: Record audit log entry (insert-only)
      await supabase.from('audit_log').insert({
        session_id: sessionRecord.id,
        actor: 'kiosk_patient',
        action: 'PATIENT_IDENTIFIED',
        details: {
          identification_method: mode,
          language_selected: language,
          token_number: tokenNumber,
        },
      })

      // Proceed to Step C (Consent)
      onNext()
    } catch (err: any) {
      console.error('Submission failed:', err)
      setErrorMsg(
        err.message || 'पंजीकरण में समस्या आई। कृपया पुनः प्रयास करें।'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Quick fill helper for testing/demos
  const fillDemoAbha = () => {
    handleAbhaChange('91234567890123')
  }

  const fillDemoAadhaar = () => {
    handleAadhaarChange('234567890123')
  }

  const fillDemoPatient = () => {
    setName('रामेश्वर शर्मा (Rameshwar Sharma)')
    setPhone('9876543210')
    setAge('52')
    setGender('male')
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full relative">
      {/* Quick link to Patient Dashboard */}
      <div className="w-full flex justify-end mb-2">
        <a
          href="/patient"
          id="link-kiosk-to-patient-portal"
          className="text-xs font-bold text-[#0f6b8e] bg-sky-50 border border-sky-200 px-3.5 py-1.5 rounded-xl hover:bg-sky-100 flex items-center gap-1 shadow-xs transition-colors"
        >
          <span>👤</span> मरीज पोर्टल (Patient Portal) →
        </a>
      </div>

      {/* ── TWO-MODE DEPARTMENT SELECTOR (GENERAL OPD DEFAULT VS AYUSH OPD) ── */}
      <div className="mb-6 flex flex-col items-center">
        <span className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
          {language === 'hi' ? 'ओपीडी विभाग चुनें (Select Department Mode):' : 'Select Department Mode:'}
        </span>
        <div className="inline-flex p-1.5 bg-slate-100 rounded-2xl border-2 border-slate-200 shadow-xs gap-1.5">
          {/* Mode 1: General Allopathic OPD (Default) */}
          <button
            type="button"
            id="btn-mode-general"
            onClick={() => setDepartment('general_medicine')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl font-bold text-sm sm:text-base transition-all cursor-pointer ${
              department !== 'ayush'
                ? 'bg-teal-700 text-white shadow-md ring-2 ring-teal-300'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <span className="text-lg">🏥</span>
            <span>{language === 'hi' ? 'सामान्य ओपीडी' : 'General OPD'}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                department !== 'ayush' ? 'bg-teal-900 text-teal-100' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {language === 'hi' ? 'डिफ़ॉल्ट' : 'Default'}
            </span>
          </button>

          {/* Mode 2: AYUSH Ayurvedic OPD */}
          <button
            type="button"
            id="btn-mode-ayush"
            onClick={() => setDepartment('ayush')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl font-bold text-sm sm:text-base transition-all cursor-pointer ${
              department === 'ayush'
                ? 'bg-emerald-700 text-white shadow-md ring-2 ring-emerald-300'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <span className="text-lg">🌿</span>
            <span>{language === 'hi' ? 'आयुष (आयुर्वेद ओपीडी)' : 'AYUSH (Ayurveda)'}</span>
            {department === 'ayush' && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-900 text-emerald-100">
                ✓ सक्रिय
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── MENU VIEW: 3 BIG ILLUSTRATED OPTIONS ───────────────────────── */}
      {mode === 'menu' && (
        <div className="w-full max-w-3xl flex flex-col items-center">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-teal-950 mb-3 tracking-tight">
              {t('identifyPrompt')}
            </h2>
            <p className="text-xl sm:text-2xl font-medium text-slate-600">
              {t('identifySub')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 w-full">
            {/* Option 1: ABHA ID */}
            <button
              id="btn-opt-abha"
              onClick={() => setMode('abha')}
              type="button"
              className="flex items-center gap-5 p-6 sm:p-7 rounded-3xl bg-white border-3 border-teal-200 hover:border-teal-600 hover:bg-teal-50/40 shadow-md hover:shadow-xl active:scale-98 transition-all duration-200 text-left cursor-pointer min-h-[96px]"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center text-3xl sm:text-4xl shrink-0 font-bold">
                🪪
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-teal-950">
                    {t('optionAbha')}
                  </h3>
                  <span className="text-teal-700 text-2xl">➔</span>
                </div>
                <p className="text-base sm:text-lg font-medium text-slate-600 mt-1">
                  {t('optionAbhaDesc')}
                </p>
              </div>
            </button>

            {/* Option 2: Aadhaar */}
            <button
              id="btn-opt-aadhaar"
              onClick={() => setMode('aadhaar')}
              type="button"
              className="flex items-center gap-5 p-6 sm:p-7 rounded-3xl bg-white border-3 border-sky-200 hover:border-sky-600 hover:bg-sky-50/40 shadow-md hover:shadow-xl active:scale-98 transition-all duration-200 text-left cursor-pointer min-h-[96px]"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-sky-100 text-sky-800 flex items-center justify-center text-3xl sm:text-4xl shrink-0 font-bold">
                🆔
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    {t('optionAadhaar')}
                  </h3>
                  <span className="text-sky-700 text-2xl">➔</span>
                </div>
                <p className="text-base sm:text-lg font-medium text-slate-600 mt-1">
                  {t('optionAadhaarDesc')}
                </p>
              </div>
            </button>

            {/* Option 3: New Patient Registration */}
            <button
              id="btn-opt-new-reg"
              onClick={() => setMode('new_patient')}
              type="button"
              className="flex items-center gap-5 p-6 sm:p-7 rounded-3xl bg-white border-3 border-amber-300 hover:border-amber-600 hover:bg-amber-50/40 shadow-md hover:shadow-xl active:scale-98 transition-all duration-200 text-left cursor-pointer min-h-[96px]"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center text-3xl sm:text-4xl shrink-0 font-bold">
                📝
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    {t('optionNew')}
                  </h3>
                  <span className="text-amber-700 text-2xl">➔</span>
                </div>
                <p className="text-base sm:text-lg font-medium text-slate-600 mt-1">
                  {t('optionNewDesc')}
                </p>
              </div>
            </button>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onBack}
              type="button"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border-2 border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 active:scale-95 text-base cursor-pointer"
            >
              <span>🌐</span>
              <span>{t('back')} (भाषा बदलें / Change Language)</span>
            </button>

            {/* Hidden Staff Setup Button */}
            <button
              id="btn-toggle-staff-setup"
              onClick={() => setShowStaffSetup(true)}
              type="button"
              className="text-xs font-semibold text-slate-600 hover:text-teal-800 bg-slate-100 hover:bg-teal-50 px-3 py-2 rounded-xl border border-slate-200 flex items-center gap-1.5 cursor-pointer"
              title="Hospital Staff Setup"
            >
              <span>⚙️</span>
              <span>स्टाफ सेटअप (Staff Setup)</span>
            </button>
          </div>

          {/* ── STAFF SETUP MODAL ────────────────────────────────────────── */}
          {showStaffSetup && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border-2 border-teal-300 text-left">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⚙️</span>
                    <h3 className="text-xl font-bold text-teal-950">
                      कियोस्क ओपीडी विभाग (Kiosk Department)
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowStaffSetup(false)}
                    type="button"
                    className="text-slate-400 hover:text-slate-700 text-2xl font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-sm font-medium text-slate-500 mb-4">
                  यह विकल्प अस्पताल कर्मचारियों द्वारा कियोस्क की ओपीडी शाखा तय करने के लिए है:
                </p>

                <div className="space-y-3 mb-6">
                  {/* General Medicine */}
                  <button
                    type="button"
                    id="btn-dept-general"
                    onClick={() => setDepartment('general_medicine')}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 text-left cursor-pointer transition-all ${
                      department === 'general_medicine'
                        ? 'bg-teal-50 border-teal-700 text-teal-950 font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏥</span>
                      <div>
                        <div className="text-base font-bold">General OPD (एलोपैथी)</div>
                        <div className="text-xs text-slate-500">Standard general medicine interview</div>
                      </div>
                    </div>
                    {department === 'general_medicine' && (
                      <span className="text-teal-700 font-bold">✓ सक्रिय</span>
                    )}
                  </button>

                  {/* AYUSH Mode */}
                  <button
                    type="button"
                    id="btn-dept-ayush"
                    onClick={() => setDepartment('ayush')}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 text-left cursor-pointer transition-all ${
                      department === 'ayush'
                        ? 'bg-emerald-50 border-emerald-700 text-emerald-950 font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🌿</span>
                      <div>
                        <div className="text-base font-bold">AYUSH (आयुर्वेद ओपीडी)</div>
                        <div className="text-xs text-slate-500">
                          Prakriti, Vikriti, Agni, Koshtha & Ahara-Vihara
                        </div>
                      </div>
                    </div>
                    {department === 'ayush' && (
                      <span className="text-emerald-700 font-bold">✓ सक्रिय</span>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  id="btn-save-staff-setup"
                  onClick={() => setShowStaffSetup(false)}
                  className="w-full py-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-base cursor-pointer"
                >
                  सेटिंग्स लागू करें (Apply & Close)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SUB-VIEW: ABHA ID ENTRY FORM ───────────────────────────────── */}
      {mode === 'abha' && (
        <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-teal-100">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🪪</span>
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-teal-950">
                  {t('optionAbha')}
                </h3>
                <p className="text-sm font-medium text-slate-500">{t('abhaHelper')}</p>
              </div>
            </div>
            <button
              onClick={() => setMode('menu')}
              type="button"
              className="text-slate-500 hover:text-slate-800 p-2 text-xl font-bold cursor-pointer"
              title="Close"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="input-abha" className="block text-xl font-bold text-slate-800 mb-2">
                {t('abhaInputLabel')}
              </label>
              <input
                id="input-abha"
                type="text"
                inputMode="numeric"
                value={abhaInput}
                onChange={(e) => handleAbhaChange(e.target.value)}
                placeholder={t('abhaPlaceholder')}
                className="w-full text-2xl sm:text-3xl font-mono tracking-widest px-5 py-4 rounded-2xl border-3 border-teal-300 focus:border-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-100 transition-all bg-sky-50/40 text-slate-900"
                autoFocus
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm font-medium text-slate-500">
                  14 अंक आवश्यक (उदा. 91-2345-6789-0123)
                </span>
                <button
                  type="button"
                  onClick={fillDemoAbha}
                  className="text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg hover:bg-teal-100 cursor-pointer"
                >
                  ⚡ नमूना भरें (Demo Fill)
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 font-semibold text-base flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button
                type="button"
                onClick={() => setMode('menu')}
                className="btn-ghost flex-1 text-lg"
              >
                {t('back')}
              </button>
              <button
                id="btn-submit-abha"
                type="submit"
                disabled={isSubmitting}
                className="btn-primary flex-1 text-xl font-bold bg-teal-700 hover:bg-teal-800 text-white min-h-[64px]"
              >
                {isSubmitting ? t('submitting') : t('proceedToConsent') + ' ➔'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── SUB-VIEW: AADHAAR ENTRY FORM ───────────────────────────────── */}
      {mode === 'aadhaar' && (
        <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-sky-100">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🆔</span>
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {t('optionAadhaar')}
                </h3>
                <p className="text-sm font-medium text-slate-500">{t('aadhaarHelper')}</p>
              </div>
            </div>
            <button
              onClick={() => setMode('menu')}
              type="button"
              className="text-slate-500 hover:text-slate-800 p-2 text-xl font-bold cursor-pointer"
              title="Close"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="input-aadhaar" className="block text-xl font-bold text-slate-800 mb-2">
                {t('aadhaarInputLabel')}
              </label>
              <input
                id="input-aadhaar"
                type="text"
                inputMode="numeric"
                value={aadhaarInput}
                onChange={(e) => handleAadhaarChange(e.target.value)}
                placeholder={t('aadhaarPlaceholder')}
                className="w-full text-2xl sm:text-3xl font-mono tracking-widest px-5 py-4 rounded-2xl border-3 border-sky-300 focus:border-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-100 transition-all bg-sky-50/40 text-slate-900"
                autoFocus
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm font-medium text-slate-500">
                  12 अंक (उदा. 2345 6789 0123)
                </span>
                <button
                  type="button"
                  onClick={fillDemoAadhaar}
                  className="text-xs font-bold text-sky-700 bg-sky-50 px-3 py-1.5 rounded-lg hover:bg-sky-100 cursor-pointer"
                >
                  ⚡ नमूना भरें (Demo Fill)
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 font-semibold text-base flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button
                type="button"
                onClick={() => setMode('menu')}
                className="btn-ghost flex-1 text-lg"
              >
                {t('back')}
              </button>
              <button
                id="btn-submit-aadhaar"
                type="submit"
                disabled={isSubmitting}
                className="btn-primary flex-1 text-xl font-bold bg-teal-700 hover:bg-teal-800 text-white min-h-[64px]"
              >
                {isSubmitting ? t('submitting') : t('proceedToConsent') + ' ➔'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── SUB-VIEW: NEW PATIENT REGISTRATION FORM ────────────────────── */}
      {mode === 'new_patient' && (
        <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-amber-100">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📝</span>
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {t('optionNew')}
                </h3>
                <p className="text-sm font-medium text-slate-500">{t('optionNewDesc')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={fillDemoPatient}
              className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 cursor-pointer"
            >
              ⚡ नमूना भरें (Auto Demo)
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div>
              <label htmlFor="input-name" className="block text-lg font-bold text-slate-800 mb-1">
                {t('nameLabel')} *
              </label>
              <input
                id="input-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setErrorMsg(null)
                }}
                placeholder={t('namePlaceholder')}
                className="w-full text-xl font-medium px-5 py-3.5 rounded-2xl border-2 border-slate-300 focus:border-teal-700 focus:outline-none focus:ring-3 focus:ring-teal-100 text-slate-900"
                required
              />
            </div>

            {/* Mobile Phone */}
            <div>
              <label htmlFor="input-phone" className="block text-lg font-bold text-slate-800 mb-1">
                {t('phoneLabel')} *
              </label>
              <input
                id="input-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))
                  setErrorMsg(null)
                }}
                placeholder={t('phonePlaceholder')}
                className="w-full text-xl font-mono px-5 py-3.5 rounded-2xl border-2 border-slate-300 focus:border-teal-700 focus:outline-none focus:ring-3 focus:ring-teal-100 text-slate-900"
                required
              />
            </div>

            {/* Age & Gender Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="input-age" className="block text-lg font-bold text-slate-800 mb-1">
                  {t('ageLabel')} *
                </label>
                <input
                  id="input-age"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  value={age}
                  onChange={(e) => {
                    setAge(e.target.value)
                    setErrorMsg(null)
                  }}
                  placeholder={t('agePlaceholder')}
                  className="w-full text-xl font-medium px-5 py-3.5 rounded-2xl border-2 border-slate-300 focus:border-teal-700 focus:outline-none focus:ring-3 focus:ring-teal-100 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-lg font-bold text-slate-800 mb-1">
                  {t('genderLabel')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`py-3 rounded-xl font-bold text-sm border-2 cursor-pointer transition-all ${
                      gender === 'male'
                        ? 'bg-teal-700 text-white border-teal-800'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {t('genderMale')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`py-3 rounded-xl font-bold text-sm border-2 cursor-pointer transition-all ${
                      gender === 'female'
                        ? 'bg-teal-700 text-white border-teal-800'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {t('genderFemale')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('other')}
                    className={`py-3 rounded-xl font-bold text-sm border-2 cursor-pointer transition-all ${
                      gender === 'other'
                        ? 'bg-teal-700 text-white border-teal-800'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {t('genderOther')}
                  </button>
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 font-semibold text-base flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 pt-3">
              <button
                type="button"
                onClick={() => setMode('menu')}
                className="btn-ghost flex-1 text-lg"
              >
                {t('back')}
              </button>
              <button
                id="btn-submit-new-patient"
                type="submit"
                disabled={isSubmitting}
                className="btn-primary flex-1 text-xl font-bold bg-teal-700 hover:bg-teal-800 text-white min-h-[64px]"
              >
                {isSubmitting ? t('submitting') : t('proceedToConsent') + ' ➔'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
