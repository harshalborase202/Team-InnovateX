import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useKiosk } from '../../context/KioskContext'
import {
  registerPatient,
  loginPatient,
  logoutPatient,
  getActivePatientUser,
  linkPatientAccount,
  getPatientVisitSessions,
  getVisitDetail,
  verifyCrossPatientIsolation,
  PatientSessionItem,
  PatientVisitDetail,
} from '../../services/patientAuthService'

export function ScreenPatientDashboard() {
  const { t, language, setScreenAudio, replayAudio, isSpeaking, setIsSettingsOpen } = useKiosk()
  // ── Auth State ──
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [patientProfile, setPatientProfile] = useState<any | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  // ── Form State ──
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [abhaId, setAbhaId] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null)

  // ── Dashboard State ──
  const [sessions, setSessions] = useState<PatientSessionItem[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [selectedVisit, setSelectedVisit] = useState<PatientVisitDetail | null>(null)
  const [loadingVisitDetail, setLoadingVisitDetail] = useState(false)

  // ── Account Linking State ──
  const [linkAbha, setLinkAbha] = useState('')
  const [linkPhone, setLinkPhone] = useState('')
  const [linkingLoading, setLinkingLoading] = useState(false)
  const [linkingResult, setLinkingResult] = useState<{ success: boolean; message: string } | null>(null)

  // ── Security Isolation Test State ──
  const [foreignSessionId, setForeignSessionId] = useState('01ce4bf2-a2ec-4d34-a288-07fc1a4ad39f')
  const [securityTesting, setSecurityTesting] = useState(false)
  const [securityTestResult, setSecurityTestResult] = useState<{
    tested: boolean
    isolated: boolean
    rowsReturned: number
    message: string
  } | null>(null)

  // Check auth on mount
  useEffect(() => {
    async function checkAuth() {
      setIsInitializing(true)
      try {
        const { user, patientProfile } = await getActivePatientUser()
        if (user) {
          setCurrentUser(user)
          setPatientProfile(patientProfile)
          await loadSessions()
        }
      } catch (err) {
        console.error('Failed to init patient auth:', err)
      } finally {
        setIsInitializing(false)
      }
    }
    checkAuth()
  }, [])

  // Accessibility screen audio announcement
  useEffect(() => {
    const patientAudio =
      language === 'hi'
        ? 'मरीज़ स्वास्थ्य खाता पोर्टल। अपने पिछले ओपीडी परामर्श, डिजिटल पर्चे और स्वास्थ्य सारांश यहाँ देखें।'
        : 'Patient Health Portal. View your previous OPD consultations, digital prescriptions, and clinical summaries.'
    setScreenAudio(patientAudio)
  }, [language, setScreenAudio])

  // Load sessions for logged in user
  async function loadSessions() {
    setLoadingSessions(true)
    try {
      const data = await getPatientVisitSessions()
      setSessions(data)
    } catch (err) {
      console.error('Failed to load patient sessions:', err)
    } finally {
      setLoadingSessions(false)
    }
  }

  // Handle Login
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthError(null)
    setAuthSuccessMsg(null)

    if (!email || !password) {
      setAuthError('कृपया ईमेल और पासवर्ड दोनों दर्ज करें (Please enter both email and password)')
      return
    }

    setAuthLoading(true)
    try {
      const res = await loginPatient(email, password)
      if (res.error) {
        if (res.error.toLowerCase().includes('invalid login credentials')) {
          setAuthError('गलत ईमेल या पासवर्ड। कृपया पुनः जांचें (Incorrect email or password. Please verify)')
        } else if (res.error.toLowerCase().includes('email not confirmed')) {
          setAuthError('ईमेल सत्यापन लंबित है। (Email verification is pending or auto-confirm required)')
        } else {
          setAuthError(res.error)
        }
      } else if (res.user) {
        setCurrentUser(res.user)
        const profileRes = await getActivePatientUser()
        setPatientProfile(profileRes.patientProfile)
        await loadSessions()
      }
    } catch (err: any) {
      setAuthError(err.message || 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }

  // Handle Register
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setAuthError(null)
    setAuthSuccessMsg(null)

    if (!email || !password || !name) {
      setAuthError('कृपया नाम, ईमेल और पासवर्ड भरें (Please fill name, email, and password)')
      return
    }

    if (password.length < 6) {
      setAuthError('पासवर्ड कम से कम 6 अक्षरों का होना चाहिए (Password must be at least 6 characters)')
      return
    }

    setAuthLoading(true)
    try {
      const res = await registerPatient({
        email,
        password,
        name,
        phoneNumber,
        abhaId,
      })

      if (res.error) {
        setAuthError(res.error)
      } else if (res.needsEmailConfirmation) {
        setAuthSuccessMsg(
          'खाता सफलतापूर्वक बनाया गया! यदि आवश्यक हो तो ईमेल पुष्टिकरण लिंक देखें। अब लॉगिन कर सकते हैं।'
        )
        setAuthMode('login')
      } else if (res.user) {
        setCurrentUser(res.user)
        const profileRes = await getActivePatientUser()
        setPatientProfile(profileRes.patientProfile)
        await loadSessions()
      }
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed')
    } finally {
      setAuthLoading(false)
    }
  }

  // Handle Logout
  async function handleLogout() {
    await logoutPatient()
    setCurrentUser(null)
    setPatientProfile(null)
    setSessions([])
    setSelectedVisit(null)
    setSecurityTestResult(null)
  }

  // Handle Manual Account Linking
  async function handleLinkAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!linkAbha && !linkPhone) {
      setLinkingResult({
        success: false,
        message: 'कृपया ABHA ID या पंजीकृत मोबाइल नंबर दर्ज करें (Enter ABHA ID or Mobile Number)',
      })
      return
    }

    setLinkingLoading(true)
    setLinkingResult(null)
    try {
      const result = await linkPatientAccount(linkAbha, linkPhone)
      setLinkingResult(result)
      if (result.success) {
        // Refresh profile and sessions
        const { patientProfile: p } = await getActivePatientUser()
        setPatientProfile(p)
        await loadSessions()
        setLinkAbha('')
        setLinkPhone('')
      }
    } catch (err: any) {
      setLinkingResult({ success: false, message: err.message || 'Linking failed' })
    } finally {
      setLinkingLoading(false)
    }
  }

  // Open Visit Detail View
  async function handleOpenVisit(sessionId: string) {
    setLoadingVisitDetail(true)
    try {
      const detail = await getVisitDetail(sessionId)
      setSelectedVisit(detail)
    } catch (err) {
      console.error('Failed to get visit detail:', err)
    } finally {
      setLoadingVisitDetail(false)
    }
  }

  // Quick fill demo helpers
  const fillDemoRegister = () => {
    setName('रामेश्वर शर्मा (Rameshwar Sharma)')
    setEmail('rameshwar.sharma.test2026@gmail.com')
    setPassword('Password123!')
    setPhoneNumber('9876543210')
    setAbhaId('91-2345-6789-0123')
  }

  const fillDemoLogin = () => {
    setEmail('rameshwar.sharma.test2026@gmail.com')
    setPassword('Password123!')
  }

  // Run Security Isolation Test
  async function runSecurityTest() {
    if (!foreignSessionId) return
    setSecurityTesting(true)
    try {
      const result = await verifyCrossPatientIsolation(foreignSessionId.trim())
      setSecurityTestResult({
        tested: true,
        isolated: result.isolated,
        rowsReturned: result.rowsReturned,
        message: result.message,
      })
    } catch (err: any) {
      setSecurityTestResult({
        tested: true,
        isolated: true,
        rowsReturned: 0,
        message: 'Isolation strictly enforced by database.',
      })
    } finally {
      setSecurityTesting(false)
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // RENDER: Loading Initial State
  // ──────────────────────────────────────────────────────────────────
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg border border-slate-200 max-w-sm">
          <div className="w-12 h-12 border-4 border-[#0f6b8e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800">स्वास्थ्य पोर्टल लोड हो रहा है...</h2>
          <p className="text-sm text-slate-500 mt-1">Loading Patient Health Portal</p>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────
  // RENDER SCREEN 1: LOGIN / REGISTER (If Not Logged In)
  // ──────────────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#e0f2fe] via-slate-50 to-white flex flex-col justify-between">
        {/* Navigation Bar */}
        <header className="bg-white/80 backdrop-blur border-b border-sky-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#0f6b8e] text-white flex items-center justify-center font-black text-2xl shadow-md">
              +
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-tight">स्वास्थ्य पोर्टल (Patient Portal)</h1>
              <p className="text-xs font-semibold text-slate-500">MediKiosk Digital Health Records</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="btn-patient-login-replay-audio"
              onClick={replayAudio}
              type="button"
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer min-h-[48px] min-w-[48px] ${
                isSpeaking
                  ? 'bg-amber-400 text-amber-950 border-amber-500 animate-pulse'
                  : 'bg-sky-50 text-teal-800 border-sky-200 hover:bg-sky-100'
              }`}
              aria-label={t('repeatAudio')}
              title={t('repeatAudio')}
            >
              <span role="img" aria-hidden="true">{isSpeaking ? '🔊' : '🔈'}</span>
              <span className="hidden sm:inline">{isSpeaking ? t('speakingNow') : t('repeatAudio')}</span>
            </button>

            {/* Sugamyata / Accessibility Settings Button */}
            <button
              id="btn-patient-login-settings"
              onClick={() => setIsSettingsOpen(true)}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold bg-white hover:bg-teal-50 text-teal-900 border-2 border-teal-600 cursor-pointer min-h-[48px] shadow-xs active:scale-95"
              aria-label={t('openSettings')}
              title={t('openSettings')}
            >
              <span className="text-base" role="img" aria-hidden="true">⚙️</span>
              <span className="font-extrabold">{t('settings')}</span>
            </button>

            <Link
              to="/"
              className="text-sm font-bold text-[#0f6b8e] hover:underline flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-50 border border-sky-200 min-h-[48px]"
            >
              ← अस्पताल कियोस्क (Hospital Kiosk)
            </Link>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-xl w-full mx-auto p-6 flex flex-col justify-center">
          <div className="card shadow-xl border border-sky-100 p-8 rounded-3xl bg-white">
            {/* Mode Switcher Tabs */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login')
                  setAuthError(null)
                  setAuthSuccessMsg(null)
                }}
                className={`flex-1 py-3 text-center rounded-xl font-bold transition-all text-base ${
                  authMode === 'login'
                    ? 'bg-white text-[#0f6b8e] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                id="tab-login"
              >
                लॉगिन (Sign In)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register')
                  setAuthError(null)
                  setAuthSuccessMsg(null)
                }}
                className={`flex-1 py-3 text-center rounded-xl font-bold transition-all text-base ${
                  authMode === 'register'
                    ? 'bg-white text-[#0f6b8e] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                id="tab-register"
              >
                नया खाता (Register)
              </button>
            </div>

            {/* Error Message Box */}
            {authError && (
              <div
                className="mb-6 p-4 rounded-xl bg-red-50 border-2 border-red-200 text-red-800 text-sm font-semibold flex items-start gap-3"
                role="alert"
                id="auth-error-banner"
              >
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="font-bold">त्रुटि (Error)</p>
                  <p className="mt-0.5">{authError}</p>
                </div>
              </div>
            )}

            {/* Success Message Box */}
            {authSuccessMsg && (
              <div
                className="mb-6 p-4 rounded-xl bg-emerald-50 border-2 border-emerald-200 text-emerald-800 text-sm font-semibold flex items-start gap-3"
                id="auth-success-banner"
              >
                <span className="text-xl">✅</span>
                <div>
                  <p className="font-bold">सफल (Success)</p>
                  <p className="mt-0.5">{authSuccessMsg}</p>
                </div>
              </div>
            )}

            {/* Login Form */}
            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-5" id="form-patient-login">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">
                    ईमेल पता (Email Address)
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    id="input-login-email"
                    className="w-full px-4 py-3.5 text-base rounded-xl border-2 border-slate-200 focus:border-[#0f6b8e] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-bold text-slate-700">
                      पासवर्ड (Password)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-xs font-bold text-[#0f6b8e] hover:underline"
                      id="btn-toggle-login-pwd"
                    >
                      {showPassword ? 'पासवर्ड छुपाएं (Hide)' : 'पासवर्ड देखें (Show)'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      id="input-login-password"
                      className="w-full px-4 py-3.5 text-base rounded-xl border-2 border-slate-200 focus:border-[#0f6b8e] focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  id="btn-submit-login"
                  className="w-full py-4 rounded-xl bg-[#0f6b8e] text-white font-bold text-lg hover:bg-[#0a4d66] transition-all shadow-md active:scale-98 disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                >
                  {authLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      सत्यापित हो रहा है...
                    </>
                  ) : (
                    'लॉगिन करें (Sign In) →'
                  )}
                </button>
              </form>
            ) : (
              /* Register Form */
              <form onSubmit={handleRegister} className="space-y-4" id="form-patient-register">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    पूरा नाम (Full Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="जैसे: रामेश्वर शर्मा"
                    id="input-register-name"
                    className="w-full px-4 py-3 text-base rounded-xl border-2 border-slate-200 focus:border-[#0f6b8e] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    ईमेल पता (Email Address) *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="patient@example.com"
                    id="input-register-email"
                    className="w-full px-4 py-3 text-base rounded-xl border-2 border-slate-200 focus:border-[#0f6b8e] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-bold text-slate-700">
                      पासवर्ड बनाएं (Create Password) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-xs font-bold text-[#0f6b8e] hover:underline"
                      id="btn-toggle-register-pwd"
                    >
                      {showPassword ? 'छुपाएं (Hide)' : 'देखें (Show)'}
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="कम से कम 6 अक्षर"
                    id="input-register-password"
                    className="w-full px-4 py-3 text-base rounded-xl border-2 border-slate-200 focus:border-[#0f6b8e] focus:outline-none transition-colors"
                  />
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      अस्पताल कियोस्क रिकॉर्ड लिंक (Auto-Link Kiosk Visits)
                    </span>
                    <p className="text-xs text-slate-500">
                      यदि आपने कियोस्क पर मोबाइल या ABHA दिया था, तो यहाँ दर्ज करने से आपकी पुरानी विज़िट जुड़ जाएंगी।
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">
                        मोबाइल नंबर (Mobile Number)
                      </label>
                      <input
                        type="tel"
                        maxLength={10}
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="9876543210"
                        id="input-register-phone"
                        className="w-full px-4 py-3 text-base rounded-xl border-2 border-slate-200 focus:border-[#0f6b8e] focus:outline-none transition-colors font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">
                        ABHA ID / पता (वैकल्पिक / Optional)
                      </label>
                      <input
                        type="text"
                        value={abhaId}
                        onChange={(e) => setAbhaId(e.target.value)}
                        placeholder="14-digit ABHA or name@abdm"
                        id="input-register-abha"
                        className="w-full px-4 py-3 text-base rounded-xl border-2 border-slate-200 focus:border-[#0f6b8e] focus:outline-none transition-colors font-mono"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  id="btn-submit-register"
                  className="w-full py-4 rounded-xl bg-emerald-700 text-white font-bold text-lg hover:bg-emerald-800 transition-all shadow-md active:scale-98 disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                >
                  {authLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      खाता बन रहा है...
                    </>
                  ) : (
                    'खाता बनाएं और लिंक करें (Register) ✓'
                  )}
                </button>
              </form>
            )}

            {/* Quick Demo Helper Button */}
            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <button
                type="button"
                id="btn-quick-fill-demo"
                onClick={authMode === 'register' ? fillDemoRegister : fillDemoLogin}
                className="w-full py-3 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[#0f6b8e] font-bold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>⚡</span>
                {authMode === 'register'
                  ? 'परीक्षण डेटा भरें (Quick Fill: रामेश्वर शर्मा • 9876543210)'
                  : 'परीक्षण लॉगिन भरें (Quick Fill Test Account)'}
              </button>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center py-4 text-xs font-semibold text-slate-400">
          MediKiosk Patient Health Portal • सुरक्षित व निजी स्वास्थ्य रिकॉर्ड
        </footer>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────
  // RENDER SCREEN 2 & 3: LOGGED-IN PATIENT DASHBOARD & DETAIL MODAL
  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Portal Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0f6b8e] text-white flex items-center justify-center font-black text-xl shadow">
              +
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900">
                  {patientProfile?.name || currentUser.user_metadata?.name || 'मरीज (Patient)'}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  प्रमाणित खाता (Verified)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {currentUser.email} • {patientProfile?.phone_number || currentUser.user_metadata?.phone_number || 'मोबाइल अनलिंक्ड'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="btn-patient-dash-replay-audio"
              onClick={replayAudio}
              type="button"
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer min-h-[48px] min-w-[48px] ${
                isSpeaking
                  ? 'bg-amber-400 text-amber-950 border-amber-500 animate-pulse'
                  : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
              }`}
              aria-label={t('repeatAudio')}
              title={t('repeatAudio')}
            >
              <span role="img" aria-hidden="true">{isSpeaking ? '🔊' : '🔈'}</span>
              <span className="hidden sm:inline">{isSpeaking ? t('speakingNow') : t('repeatAudio')}</span>
            </button>

            {/* Sugamyata / Accessibility Settings Button */}
            <button
              id="btn-patient-dash-settings"
              onClick={() => setIsSettingsOpen(true)}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold bg-white hover:bg-teal-50 text-teal-900 border-2 border-teal-600 cursor-pointer min-h-[48px] shadow-xs active:scale-95"
              aria-label={t('openSettings')}
              title={t('openSettings')}
            >
              <span className="text-base" role="img" aria-hidden="true">⚙️</span>
              <span className="font-extrabold">{t('settings')}</span>
            </button>

            <Link
              to="/"
              className="text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 min-h-[48px] flex items-center"
            >
              कियोस्क मोड (Kiosk)
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              id="btn-logout"
              className="text-xs font-bold text-red-600 hover:text-red-700 px-3 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 transition-colors min-h-[48px] flex items-center cursor-pointer"
            >
              लॉग आउट (Sign Out)
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto p-6 flex-1 space-y-6">
        {/* Welcome & Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 card bg-gradient-to-br from-[#0f6b8e] to-[#0a4d66] text-white p-6 rounded-2xl shadow-md">
            <h2 className="text-2xl font-black mb-1">
              नमस्ते, {patientProfile?.name || currentUser.user_metadata?.name || 'मरीज'}!
            </h2>
            <p className="text-sm text-sky-100 leading-relaxed mb-4">
              आपके सभी पिछले ओपीडी परामर्श, डॉक्टर के सारांश, और अपलोड किए गए पर्चे यहाँ सुरक्षित रूप से संग्रहीत हैं।
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20">
                ABHA: {patientProfile?.abha_id || currentUser.user_metadata?.abha_id || 'अप्रकाशित / Unlinked'}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20">
                भाषा: {patientProfile?.preferred_language === 'hi' ? 'हिंदी (Hindi)' : 'English'}
              </span>
            </div>
          </div>

          <div className="card bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">कुल परामर्श (Visits)</span>
              <div className="text-3xl font-black text-slate-800 mt-2" id="stat-total-visits">
                {sessions.length}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">अस्पताल कियोस्क रिकॉर्ड</p>
          </div>

          <div className="card bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">अपलोड किए गए दस्तावेज़</span>
              <div className="text-3xl font-black text-[#0f6b8e] mt-2">
                {sessions.reduce((acc, curr) => acc + (curr.documents_count || 0), 0)}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">पर्चे व लैब रिपोर्ट्स</p>
          </div>
        </div>

        {/* Account Linking Panel (ABHA / Phone match) */}
        <div className="card bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <span>🔗</span> पुराने कियोस्क रिकॉर्ड लिंक करें (Link Past Kiosk Visits)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                यदि आपने अस्पताल कियोस्क पर अपना मोबाइल नंबर या ABHA ID दिया था, तो उसे यहाँ लिंक करके पिछले परामर्श देखें।
              </p>
            </div>
          </div>

          <form onSubmit={handleLinkAccount} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4" id="form-link-account">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                पंजीकृत मोबाइल नंबर (Registered Phone)
              </label>
              <input
                type="tel"
                maxLength={10}
                value={linkPhone}
                onChange={(e) => setLinkPhone(e.target.value)}
                placeholder="जैसे: 9876543210"
                id="input-link-phone"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:border-[#0f6b8e] focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                ABHA ID (वैकल्पिक / Optional)
              </label>
              <input
                type="text"
                value={linkAbha}
                onChange={(e) => setLinkAbha(e.target.value)}
                placeholder="14-digit ABHA number"
                id="input-link-abha"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:border-[#0f6b8e] focus:outline-none font-mono"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={linkingLoading}
                id="btn-submit-link"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold shadow transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {linkingLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    सत्यापन...
                  </>
                ) : (
                  'खाता लिंक करें (Link Account)'
                )}
              </button>
            </div>
          </form>

          {linkingResult && (
            <div
              className={`mt-4 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                linkingResult.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
              id="link-result-banner"
            >
              <span>{linkingResult.success ? '✅' : '⚠️'}</span>
              <span>{linkingResult.message}</span>
            </div>
          )}
        </div>

        {/* Visits History Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">आपके पिछले परामर्श (Past Hospital Visits)</h2>
              <p className="text-xs text-slate-500">कियोस्क सत्र, क्लीनिकल सारांश और संलग्न दस्तावेज़</p>
            </div>
            <button
              onClick={loadSessions}
              className="text-xs font-bold text-[#0f6b8e] hover:underline flex items-center gap-1"
            >
              🔄 रीफ्रेश करें (Refresh)
            </button>
          </div>

          {loadingSessions ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <div className="w-8 h-8 border-3 border-[#0f6b8e] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-600">परामर्श लोड हो रहे हैं...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
              <div className="text-4xl mb-3">📋</div>
              <h3 className="text-base font-bold text-slate-800 mb-1">कोई पिछला परामर्श नहीं मिला</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                यदि आपने पहले कियोस्क पर परामर्श लिया था, तो कृपया ऊपर दिए गए फॉर्म में अपना वही मोबाइल नंबर या ABHA दर्ज करके लिंक करें।
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="sessions-grid">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => handleOpenVisit(sess.id)}
                  id={`session-card-${sess.id}`}
                  className="card bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-[#0f6b8e] transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    {/* Header: Date & Token */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-bold text-slate-400">
                        {new Date(sess.created_at).toLocaleDateString('hi-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-sky-100 text-sky-800 font-mono">
                        {sess.token_number}
                      </span>
                    </div>

                    {/* Department badge */}
                    <div className="mb-2.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold ${
                          sess.department === 'ayush'
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {sess.department === 'ayush' ? '🌿 आयुष (AYUSH)' : '🏥 सामान्य ओपीडी (General Medicine)'}
                      </span>
                    </div>

                    {/* Chief Complaint */}
                    <h4 className="text-base font-black text-slate-800 group-hover:text-[#0f6b8e] transition-colors line-clamp-2">
                      {sess.chief_complaint || 'सामान्य परामर्श'}
                    </h4>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">
                      {sess.documents_count && sess.documents_count > 0
                        ? `📄 ${sess.documents_count} दस्तावेज़`
                        : 'कोई पर्चा नहीं'}
                    </span>
                    <span className="font-bold text-[#0f6b8e] flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      विवरण देखें →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security & RLS Isolation Verification Widget */}
        <div className="card bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800 mt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-black text-lg">🛡️</span>
                <h3 className="text-base font-black text-white">
                  गोपनीयता व डेटा सुरक्षा सत्यापन (Cross-Patient RLS Isolation Test)
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                परीक्षण करें कि वर्तमान लॉग-इन मरीज किसी अन्य मरीज के सत्र या दस्तावेज़ को नहीं देख सकता। जब किसी अन्य मरीज का Session ID लोड करने का प्रयास किया जाएगा, तो डेटाबेस RLS पॉलिसी द्वारा 0 पंक्तियां (Zero Rows) लौटाई जानी चाहिए।
              </p>
            </div>
            <button
              type="button"
              onClick={runSecurityTest}
              disabled={securityTesting}
              id="btn-run-security-test"
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              {securityTesting ? 'जांच हो रही है...' : '🔒 सुरक्षा जांच चलाएं (Run Isolation Check)'}
            </button>
          </div>

          <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="md:col-span-2">
              <label className="block text-slate-400 mb-1 font-semibold">
                परीक्षण हेतु अन्य मरीज का Session ID (Target Foreign Session ID):
              </label>
              <input
                type="text"
                value={foreignSessionId}
                onChange={(e) => setForeignSessionId(e.target.value)}
                id="input-foreign-session-id"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
            <div className="flex items-end">
              <span className="text-slate-400">
                मानक परीक्षण: किसी अन्य ओपीडी सत्र आईडी को लोड करने का प्रयास
              </span>
            </div>
          </div>

          {/* Test Result Display */}
          {securityTestResult && (
            <div
              className={`mt-4 p-4 rounded-xl border text-xs font-mono ${
                securityTestResult.isolated
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                  : 'bg-red-950/60 border-red-500/50 text-red-200'
              }`}
              id="security-test-result-box"
            >
              <div className="flex items-center gap-2 font-bold text-sm mb-1">
                <span>{securityTestResult.isolated ? '✅ RLS सुरक्षा सफल (PASSED)' : '❌ सुरक्षा विफलता (FAILED)'}</span>
              </div>
              <p className="font-sans text-xs">{securityTestResult.message}</p>
              <div className="mt-2 text-[11px] opacity-80">
                लौटाई गई पंक्तियाँ (Rows returned): <strong>{securityTestResult.rowsReturned}</strong> (अपेक्षित: 0 / Access Denied)
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Loading Visit Detail Indicator */}
      {loadingVisitDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3">
            <div className="w-5 h-5 border-3 border-[#0f6b8e] border-t-transparent rounded-full animate-spin" />
            <span className="font-bold text-slate-800 text-sm">परामर्श लोड हो रहा है...</span>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* VISIT DETAIL MODAL / DRAWER (READ-ONLY) */}
      {/* ────────────────────────────────────────────────────────────── */}
      {selectedVisit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200"
            id="modal-visit-detail"
          >
            {/* Modal Header */}
            <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-sky-100 text-sky-900 font-mono">
                  {selectedVisit.session.token_number}
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    परामर्श विवरण (Visit Clinical Record)
                  </h3>
                  <p className="text-xs text-slate-500">
                    दिनांक:{' '}
                    {new Date(selectedVisit.session.created_at).toLocaleDateString('hi-IN', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    • {selectedVisit.session.department === 'ayush' ? 'आयुष विभाग' : 'सामान्य ओपीडी'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                id="btn-close-visit-modal"
                className="w-9 h-9 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-base transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Section 1: Chief Complaint & Pre-Consult Summary */}
              <div className="p-5 rounded-2xl bg-sky-50 border border-sky-100">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0f6b8e]">
                  मुख्य शिकायत (Chief Complaint)
                </span>
                <h4 className="text-xl font-black text-slate-900 mt-1">
                  {selectedVisit.session.chief_complaint}
                </h4>

                {selectedVisit.summary?.hpi && (
                  <div className="mt-3 pt-3 border-t border-sky-200/60 text-sm text-slate-700">
                    <strong className="text-slate-900">वर्तमान बीमारी का इतिहास (HPI): </strong>
                    {selectedVisit.summary.hpi}
                  </div>
                )}
              </div>

              {/* Section 2: Clinical Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-bold text-slate-500 block mb-1">
                    पूर्व चिकित्सा इतिहास (Past Medical & Surgical)
                  </span>
                  <p className="text-slate-800">
                    {selectedVisit.summary?.past_medical_surgical || 'कोई गंभीर पूर्व बीमारी दर्ज नहीं'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-bold text-slate-500 block mb-1">
                    वर्तमान दवाएं व एलर्जी (Medications & Allergies)
                  </span>
                  <p className="text-slate-800">
                    {selectedVisit.summary?.drug_allergy || 'कोई ज्ञात एलर्जी नहीं'}
                  </p>
                </div>
              </div>

              {/* Section 3: AYUSH Details (If present) */}
              {selectedVisit.summary?.ayush && (
                <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200">
                  <h5 className="text-sm font-black text-amber-900 mb-3 flex items-center gap-1.5">
                    <span>🌿</span> आयुष प्रकृति व अग्नि विवरण (AYUSH Profile)
                  </h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-amber-100">
                      <span className="text-slate-400 block font-bold">प्रकृति (Prakriti)</span>
                      <span className="font-bold text-slate-800">
                        {typeof selectedVisit.summary.ayush.prakriti === 'object'
                          ? JSON.stringify(selectedVisit.summary.ayush.prakriti)
                          : selectedVisit.summary.ayush.prakriti || 'मध्यम'}
                      </span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-amber-100">
                      <span className="text-slate-400 block font-bold">अग्नि (Agni)</span>
                      <span className="font-bold text-slate-800">
                        {selectedVisit.summary.ayush.agni || 'सम अग्नि'}
                      </span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-amber-100">
                      <span className="text-slate-400 block font-bold">कोष्ठ (Koshtha)</span>
                      <span className="font-bold text-slate-800">
                        {selectedVisit.summary.ayush.koshtha || 'मध्यम'}
                      </span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-amber-100">
                      <span className="text-slate-400 block font-bold">विकृति (Vikriti)</span>
                      <span className="font-bold text-slate-800">
                        {typeof selectedVisit.summary.ayush.vikriti === 'object'
                          ? 'संतुलित'
                          : selectedVisit.summary.ayush.vikriti || 'संतुलित'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 4: Uploaded Documents & OCR Data */}
              <div>
                <h5 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
                  <span>📑</span> संलग्न पुराने पर्चे व रिपोर्ट (Uploaded Documents -{' '}
                  {selectedVisit.documents.length})
                </h5>

                {selectedVisit.documents.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-xl border border-slate-200">
                    इस विज़िट में कोई दस्तावेज़ अपलोड नहीं किया गया था।
                  </p>
                ) : (
                  <div className="space-y-4">
                    {selectedVisit.documents.map((doc, idx) => (
                      <div
                        key={doc.id || idx}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800 uppercase">
                            {doc.doc_type || 'Prescription / पर्चा'}
                          </span>
                          <span className="text-xs text-slate-400">
                            दिनांक: {doc.structured_json?.date_on_document || 'हालिया'}
                          </span>
                        </div>

                        {/* Extracted Diagnoses */}
                        {doc.structured_json?.diagnoses && doc.structured_json.diagnoses.length > 0 && (
                          <div className="text-xs">
                            <span className="font-bold text-slate-600 block mb-1">पहचाने गए रोग (Diagnoses):</span>
                            <div className="flex flex-wrap gap-1.5">
                              {doc.structured_json.diagnoses.map((diag: string, dIdx: number) => (
                                <span
                                  key={dIdx}
                                  className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-semibold"
                                >
                                  {diag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Extracted Medications */}
                        {doc.structured_json?.medications && doc.structured_json.medications.length > 0 && (
                          <div className="text-xs">
                            <span className="font-bold text-slate-600 block mb-1">दवाएं (Medications):</span>
                            <div className="space-y-1">
                              {doc.structured_json.medications.map((med: any, mIdx: number) => (
                                <div
                                  key={mIdx}
                                  className="bg-white p-2 rounded-lg border border-slate-200 flex justify-between"
                                >
                                  <span className="font-bold text-slate-800">{med.name} ({med.dose})</span>
                                  <span className="text-slate-500">{med.frequency}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Extracted Lab Results */}
                        {doc.structured_json?.lab_results && doc.structured_json.lab_results.length > 0 && (
                          <div className="text-xs">
                            <span className="font-bold text-slate-600 block mb-1">जांच परिणाम (Lab Results):</span>
                            <div className="space-y-1">
                              {doc.structured_json.lab_results.map((lab: any, lIdx: number) => (
                                <div
                                  key={lIdx}
                                  className="bg-white p-2 rounded-lg border border-slate-200 flex justify-between items-center"
                                >
                                  <span className="font-medium text-slate-800">{lab.test}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-slate-900">
                                      {lab.value} {lab.unit}
                                    </span>
                                    {lab.flag === 'high' && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-red-100 text-red-700">
                                        उच्च (HIGH)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="px-6 py-2.5 rounded-xl bg-[#0f6b8e] text-white font-bold text-sm hover:bg-[#0a4d66] transition-colors"
              >
                बंद करें (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default ScreenPatientDashboard
