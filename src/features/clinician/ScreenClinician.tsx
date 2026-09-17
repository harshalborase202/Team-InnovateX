import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useKiosk } from '../../context/KioskContext'
import {
  getSessionSummary,
  savePhysicianSummaryEdit,
  StructuredClinicalSummary,
  ClinicalSummaryRecord,
} from '../../services/summaryService'
import { RxPad } from '../../components/RxPad'
import { BodyPainMap } from '../../components/BodyPainMap'
import type { TriageResult } from '../../services/triageEngine'
import {
  acknowledgeSosIncident,
  playEmergencyChime,
  getLocalSosAlerts,
  dismissLocalSosAlert,
  fetchRecentSosAlerts,
  triggerSosIncident,
  SOS_CHANNEL_NAME,
  SosAlert,
  DEMO_STAFF,
} from '../../services/sosService'

interface SessionItem {
  id: string
  token_number: string
  department: string
  status: string
  created_at: string
  patients?: any
}

export const ScreenClinician: React.FC = () => {
  const { sessionId: paramSessionId } = useParams<{ sessionId?: string }>()
  const navigate = useNavigate()
  const { t, language, setScreenAudio, replayAudio, isSpeaking, setIsSettingsOpen } = useKiosk()

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('medikiosk_clinician_auth') === 'true'
  })
  const [loginEmail, setLoginEmail] = useState<string>('dr.sharma@hospital.org')
  const [loginPassword, setLoginPassword] = useState<string>('Clinician@2026')
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false)
  const [clinicianUserId, setClinicianUserId] = useState<string | null>(null)

  // Sessions & Current Patient State
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>(paramSessionId || '')
  const [currentSession, setCurrentSession] = useState<SessionItem | null>(null)
  const [scannedDocuments, setScannedDocuments] = useState<any[]>([])

  // Clinical Summary State
  const [summaryRecord, setSummaryRecord] = useState<ClinicalSummaryRecord | null>(null)
  const [summaryData, setSummaryData] = useState<StructuredClinicalSummary | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false)

  // Edit Mode States
  const [isEditMode, setIsEditMode] = useState<boolean>(false)
  const [editedSummary, setEditedSummary] = useState<StructuredClinicalSummary | null>(null)
  const [physicianNotes, setPhysicianNotes] = useState<string>('')
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null)

  // RxPad State
  const [showRxPad, setShowRxPad] = useState<boolean>(false)
  const [rxSavedMsg, setRxSavedMsg] = useState<string | null>(null)
  const [showClinicianBodyMap, setShowClinicianBodyMap] = useState<boolean>(false)

  // Real-time SOS Alert State & Emergency Console
  const [liveSosAlerts, setLiveSosAlerts] = useState<SosAlert[]>(() => getLocalSosAlerts())
  const [isSosConsoleOpen, setIsSosConsoleOpen] = useState<boolean>(false)
  const sosChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Synchronize SOS alerts across local storage, BroadcastChannel, and Supabase DB
  const syncSosAlerts = useCallback(async () => {
    const local = getLocalSosAlerts()
    let remote: SosAlert[] = []
    try {
      remote = await fetchRecentSosAlerts()
    } catch { /* ignore */ }

    const map = new Map<string, SosAlert>()
    local.forEach((a) => map.set(a.incidentId, a))
    remote.forEach((r) => {
      const existing = map.get(r.incidentId)
      if (existing) {
        map.set(r.incidentId, {
          ...existing,
          ...r,
          acknowledged: existing.acknowledged || r.acknowledged,
          acknowledgedAt: existing.acknowledgedAt || r.acknowledgedAt,
        })
      } else {
        map.set(r.incidentId, r)
      }
    })

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
    )
    setLiveSosAlerts(merged)
  }, [])

  // 1. Fetch available patient sessions
  const loadSessions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, token_number, department, status, created_at, patients(name, gender, dob, phone_number, abha_id)')
        .order('created_at', { ascending: false })
        .limit(20)

      if (!error && data && data.length > 0) {
        setSessions((data as unknown) as SessionItem[])
        const activeId = selectedSessionId || data[0].id
        setSelectedSessionId(activeId)
      }
    } catch (err) {
      console.warn('Could not fetch clinician sessions:', err)
    }
  }, [selectedSessionId])

  useEffect(() => {
    if (isAuthenticated) {
      loadSessions()
      syncSosAlerts()
    }
  }, [isAuthenticated, loadSessions, syncSosAlerts])

  // ── Multi-channel Emergency SOS Alert listener (BroadcastChannel + Storage + Realtime) ──
  useEffect(() => {
    if (!isAuthenticated) return

    // 1. Listen on BroadcastChannel for instant cross-tab alerts
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(SOS_CHANNEL_NAME)
      bc.onmessage = (e) => {
        if (e.data?.type === 'SOS_NEW' && e.data.alert) {
          playEmergencyChime()
          setLiveSosAlerts((prev) => {
            const exists = prev.some((a) => a.incidentId === e.data.alert.incidentId)
            if (exists) return prev
            return [e.data.alert, ...prev]
          })
        } else if (e.data?.type === 'SOS_ACKNOWLEDGED') {
          setLiveSosAlerts((prev) =>
            prev.map((a) =>
              a.redFlagDbId === e.data.redFlagDbId || a.incidentId === e.data.redFlagDbId
                ? {
                    ...a,
                    acknowledged: true,
                    acknowledgedBy: e.data.by,
                    acknowledgedAt: e.data.at,
                  }
                : a
            )
          )
        }
      }
    } catch { /* BroadcastChannel fallback */ }

    // 2. Window storage & custom events
    const handleUpdateEvent = () => {
      syncSosAlerts()
    }
    window.addEventListener('medikiosk-sos-updated', handleUpdateEvent)
    window.addEventListener('storage', handleUpdateEvent)

    // 3. 6-second heartbeat polling for DB updates
    const pollInterval = setInterval(() => {
      syncSosAlerts()
    }, 6000)

    // 4. Supabase Realtime channel
    const channel = supabase
      .channel('sos-live-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'red_flags', filter: 'severity=eq.critical' },
        (payload) => {
          const row = payload.new as any
          if (row.flag_type === 'sos_call_for_help') {
            playEmergencyChime()
            syncSosAlerts()
          }
        }
      )
      .subscribe()

    sosChannelRef.current = channel

    return () => {
      if (bc) bc.close()
      window.removeEventListener('medikiosk-sos-updated', handleUpdateEvent)
      window.removeEventListener('storage', handleUpdateEvent)
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
      sosChannelRef.current = null
    }
  }, [isAuthenticated, syncSosAlerts])

  // Handler: Acknowledge an SOS alert from clinician side
  const handleAcknowledgeSos = useCallback(
    async (alertIdentifier: string) => {
      const docName = 'Dr. S. Sharma, MD (Attending Physician)'
      await acknowledgeSosIncident(alertIdentifier, docName, clinicianUserId)
      setLiveSosAlerts((prev) =>
        prev.map((a) =>
          a.incidentId === alertIdentifier || a.redFlagDbId === alertIdentifier
            ? {
                ...a,
                acknowledged: true,
                acknowledgedBy: docName,
                acknowledgedAt: new Date().toISOString(),
              }
            : a
        )
      )
    },
    [clinicianUserId]
  )

  // Handler: Dismiss / Archive an SOS alert
  const handleDismissSos = useCallback((alertIdentifier: string) => {
    dismissLocalSosAlert(alertIdentifier)
    setLiveSosAlerts((prev) =>
      prev.filter((a) => a.incidentId !== alertIdentifier && a.redFlagDbId !== alertIdentifier)
    )
  }, [])

  // Handler: Trigger live demo simulation SOS from clinician screen
  const handleSimulateDemoSos = useCallback(async () => {
    const activeItem = sessions.find((s) => s.id === selectedSessionId) || currentSession
    const patientName =
      (Array.isArray(activeItem?.patients) ? activeItem?.patients[0]?.name : activeItem?.patients?.name) ||
      'Sunil Gavaskar'
    const token = activeItem?.token_number || 'T-102'

    const simulated = await triggerSosIncident(
      selectedSessionId || null,
      patientName,
      token,
      language
    )
    setLiveSosAlerts((prev) => [simulated, ...prev.filter((a) => a.incidentId !== simulated.incidentId)])
  }, [sessions, selectedSessionId, currentSession, language])

  // Accessibility screen audio announcement
  useEffect(() => {
    const clinicianPrompt =
      language === 'hi'
        ? 'डॉक्टर परामर्श पोर्टल। मरीज़ों की सूची से टोकन चुनें और तैयार नैदानिक सारांश व पर्चे देखें।'
        : 'Doctor consultation portal. Select a patient session from the queue to review clinical summary and scanned documents.'
    setScreenAudio(clinicianPrompt)
  }, [language, setScreenAudio])

  // 2. Fetch clinical summary & scanned documents when selectedSessionId changes
  const loadSessionDetails = useCallback(async (sessId: string) => {
    if (!sessId) return
    setIsLoadingSummary(true)
    setSaveSuccessMsg(null)

    try {
      // Find session item
      const sess = sessions.find((s) => s.id === sessId)
      if (sess) setCurrentSession(sess)

      // Fetch summary
      const record = await getSessionSummary(sessId)
      if (record) {
        setSummaryRecord(record)
        setSummaryData(record.summary_json)
        setEditedSummary(JSON.parse(JSON.stringify(record.summary_json)))
        setPhysicianNotes(record.physician_notes || '')
      }

      // Fetch scanned documents for this session
      const { data: docs } = await supabase
        .from('documents')
        .select('*')
        .eq('session_id', sessId)
        .order('created_at', { ascending: true })

      if (docs) {
        setScannedDocuments(docs)
      }
    } catch (err) {
      console.error('Error loading session clinical details:', err)
    } finally {
      setIsLoadingSummary(false)
    }
  }, [sessions])

  useEffect(() => {
    if (selectedSessionId && isAuthenticated) {
      loadSessionDetails(selectedSessionId)
    }
  }, [selectedSessionId, isAuthenticated, loadSessionDetails])

  // Clinician Login Handler
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setIsLoggingIn(true)
    setAuthError(null)

    try {
      // Try Supabase Auth login
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      })

      // Accept credentials (or demo clinician access)
      if (error && !loginEmail.includes('dr.') && !loginEmail.includes('demo')) {
        setAuthError(error.message)
        setIsLoggingIn(false)
        return
      }

      // Set logged in — capture real auth UID if Supabase login succeeded
      const { data: sessionData } = await supabase.auth.getSession()
      setClinicianUserId(sessionData?.session?.user?.id ?? null)
      localStorage.setItem('medikiosk_clinician_auth', 'true')
      setIsAuthenticated(true)
    } catch {
      localStorage.setItem('medikiosk_clinician_auth', 'true')
      setIsAuthenticated(true)
    } finally {
      setIsLoggingIn(false)
    }
  }

  // Quick Demo Login Helper
  const handleQuickDemoLogin = () => {
    localStorage.setItem('medikiosk_clinician_auth', 'true')
    setIsAuthenticated(true)
  }

  // Clinician Logout
  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('medikiosk_clinician_auth')
    setIsAuthenticated(false)
  }

  // Save Physician Edits
  const handleSaveEdits = async () => {
    if (!selectedSessionId || !editedSummary) return
    setIsSavingEdit(true)
    setSaveSuccessMsg(null)

    try {
      // Pass the real clinician UUID (or null for demo/bypass logins)
      const updated = await savePhysicianSummaryEdit(
        selectedSessionId,
        editedSummary,
        physicianNotes,
        clinicianUserId ?? undefined
      )

      if (updated) {
        setSummaryRecord(updated)
        setSummaryData(updated.summary_json)
        setIsEditMode(false)
        setSaveSuccessMsg('✓ Clinical record amended, verified, and saved by Attending Physician.')
      }
    } catch (err: any) {
      console.error('Failed to save physician edit:', err)
      alert(`Error saving summary: ${err.message}`)
    } finally {
      setIsSavingEdit(false)
    }
  }

  // ── 1. LOGIN SCREEN ────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
        {/* Clinician Login Top Header */}
        <header className="w-full bg-slate-800/90 border-b border-slate-700 px-4 sm:px-8 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🩺</span>
            <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
              MediKiosk EHR • Clinician Portal
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="btn-clinician-login-settings"
              onClick={() => setIsSettingsOpen(true)}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold bg-slate-700 hover:bg-slate-600 text-teal-300 border border-teal-500 cursor-pointer min-h-[44px] shadow-xs active:scale-95"
              aria-label={t('openSettings')}
              title={t('openSettings')}
            >
              <span role="img" aria-hidden="true">⚙️</span>
              <span className="font-extrabold">{t('settings')}</span>
            </button>
            <button
              onClick={() => navigate('/kiosk')}
              type="button"
              className="text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl border border-slate-600 cursor-pointer min-h-[44px]"
            >
              ← OPD Kiosk
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-700">
              <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center text-2xl font-bold">
                🩺
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-white">Clinician Portal</h2>
                <p className="text-xs text-slate-400">Hospital OPD Physician Dashboard</p>
              </div>
            </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Doctor Email / Username
              </label>
              <input
                id="input-clinician-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-600 text-white focus:border-teal-400 focus:outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Password
              </label>
              <input
                id="input-clinician-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-600 text-white focus:border-teal-400 focus:outline-none text-sm"
              />
            </div>

            {authError && (
              <p className="text-red-400 text-xs font-semibold">{authError}</p>
            )}

            <button
              id="btn-clinician-login"
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-base cursor-pointer shadow-lg transition-all"
            >
              {isLoggingIn ? 'Authenticating...' : 'Sign In as Clinician'}
            </button>
          </form>

          {/* Quick Demo Access Button */}
          <div className="mt-6 pt-4 border-t border-slate-700 text-center">
            <button
              id="btn-quick-clinician-demo"
              type="button"
              onClick={handleQuickDemoLogin}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-teal-300 text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-2 border border-slate-600"
            >
              <span>⚡</span>
              <span>Quick Demo Clinician Access (1-Click)</span>
            </button>
            <button
              onClick={() => navigate('/kiosk')}
              className="text-xs text-slate-400 hover:text-slate-200 mt-4 underline cursor-pointer"
            >
              ← Back to OPD Kiosk
            </button>
          </div>
        </div>
      </div>
    </div>
    )
  }

  // ── 2. CLINICIAN RECORD VIEW ─────────────────────────────────────────
  const activeSessionItem = sessions.find((s) => s.id === selectedSessionId) || currentSession
  const activePatient = Array.isArray(activeSessionItem?.patients) ? activeSessionItem?.patients[0] : activeSessionItem?.patients
  const redFlags = summaryData?.red_flags || []
  const hasRedFlags = redFlags.length > 0
  const isAyushDept = activeSessionItem?.department === 'ayush'
  // Auto-triage routing badge (written by ScreenConverse after Q1)
  const triageRouting: TriageResult | null = (activeSessionItem as any)?.metadata?.routing ?? null

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900">
      {/* ── TOP NAV BAR ────────────────────────────────────────────────── */}
      <header className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between border-b border-slate-800 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-xl">
            🩺
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>MediKiosk EHR • Clinician Consult</span>
              <span className="text-xs font-semibold bg-teal-800 text-teal-200 px-2 py-0.5 rounded">
                OPD Room 4
              </span>
            </h1>
            <p className="text-xs text-slate-400">Dr. S. Sharma, MD • Attending Physician</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Emergency SOS Monitor Button */}
          <button
            id="btn-clinician-sos-monitor"
            onClick={() => setIsSosConsoleOpen(true)}
            type="button"
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer min-h-[48px] shadow-sm active:scale-95 ${
              liveSosAlerts.some((a) => !a.acknowledged)
                ? 'bg-rose-600 text-white border-rose-400 animate-pulse hover:bg-rose-700'
                : liveSosAlerts.length > 0
                ? 'bg-amber-950 text-amber-200 border-amber-600 hover:bg-amber-900'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
            title="Open Hospital Emergency SOS Monitor"
            aria-label="Hospital Emergency SOS Monitor"
          >
            <span className="text-base" role="img" aria-hidden="true">🚨</span>
            <span className="hidden md:inline font-black">
              {liveSosAlerts.some((a) => !a.acknowledged) ? 'SOS EMERGENCY' : 'SOS Monitor'}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-mono font-black ${
                liveSosAlerts.some((a) => !a.acknowledged)
                  ? 'bg-white text-rose-700 animate-bounce'
                  : 'bg-slate-700 text-slate-200'
              }`}
            >
              {liveSosAlerts.filter((a) => !a.acknowledged).length}
            </span>
          </button>

          <button
            id="btn-clinician-replay-audio"
            onClick={replayAudio}
            type="button"
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer min-h-[48px] min-w-[48px] ${
              isSpeaking
                ? 'bg-amber-400 text-amber-950 border-amber-500 animate-pulse'
                : 'bg-teal-900/60 text-teal-200 border-teal-700 hover:bg-teal-800'
            }`}
            aria-label={t('repeatAudio')}
            title={t('repeatAudio')}
          >
            <span role="img" aria-hidden="true">{isSpeaking ? '🔊' : '🔈'}</span>
            <span className="hidden sm:inline">{isSpeaking ? t('speakingNow') : t('repeatAudio')}</span>
          </button>

          {/* Sugamyata / Accessibility Settings Button */}
          <button
            id="btn-clinician-settings"
            onClick={() => setIsSettingsOpen(true)}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500 cursor-pointer min-h-[48px] shadow-xs active:scale-95"
            aria-label={t('openSettings')}
            title={t('openSettings')}
          >
            <span role="img" aria-hidden="true">⚙️</span>
            <span className="font-extrabold">{t('settings')}</span>
          </button>

          <button
            onClick={() => navigate('/kiosk')}
            type="button"
            className="text-xs font-bold text-slate-300 hover:text-white bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 cursor-pointer min-h-[48px]"
            aria-label="Return to patient kiosk"
          >
            ← OPD Kiosk
          </button>
          <button
            id="btn-clinician-logout"
            onClick={handleLogout}
            type="button"
            className="text-xs font-bold text-red-300 hover:text-red-100 bg-red-950/60 px-3 py-2 rounded-xl border border-red-800 cursor-pointer min-h-[48px]"
            aria-label="Log out of clinician portal"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* ── LIVE SOS ALERT BANNER (realtime from kiosk) ──────────────── */}
      {liveSosAlerts.filter(a => !a.acknowledged).length > 0 && liveSosAlerts.filter(a => !a.acknowledged).slice(0, 2).map((alert) => (
        <div
          key={alert.incidentId}
          className="px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b-2 shadow-lg bg-rose-700 border-rose-400 text-white animate-pulse-slow"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl animate-bounce">🚨</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-white text-rose-800 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                  Critical SOS Incident
                </span>
                <span className="font-mono text-xs font-bold text-rose-200">
                  #{alert.incidentId}
                </span>
                <span className="text-xs text-rose-200">•</span>
                <span className="text-xs font-extrabold text-white">
                  📍 {alert.kioskId}
                </span>
              </div>
              <p className="font-extrabold text-sm sm:text-base leading-snug mt-0.5">
                Patient: <span className="underline decoration-white/60">{alert.patientName || 'Walk-in Patient'}</span> (Token: {alert.patientToken || '—'}) requested immediate emergency assistance!
              </p>
              <p className="text-xs text-rose-200 font-mono mt-0.5">
                Triggered at {new Date(alert.triggeredAt).toLocaleTimeString('en-IN')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id={`btn-sos-acknowledge-${alert.incidentId}`}
              type="button"
              onClick={() => handleAcknowledgeSos(alert.incidentId)}
              className="px-4 py-2 rounded-xl bg-white text-rose-800 font-black text-xs hover:bg-rose-50 cursor-pointer transition-colors shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <span>✓</span>
              <span>Acknowledge &amp; Dispatch Team</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSosConsoleOpen(true)}
              className="px-3 py-2 rounded-xl bg-rose-800/80 hover:bg-rose-900 text-white border border-rose-400 font-extrabold text-xs cursor-pointer transition-colors"
            >
              View Dispatch Details
            </button>
            <button
              type="button"
              onClick={() => handleDismissSos(alert.incidentId)}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold flex items-center justify-center cursor-pointer text-xs"
              aria-label="Dismiss SOS alert"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* ── SUB-HEADER / PATIENT SESSION SELECTOR BAR ───────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold uppercase text-slate-500">
            Active Patient / Session:
          </label>
          <select
            id="select-patient-session"
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="px-3 py-2 rounded-xl border-2 border-slate-300 font-bold text-slate-800 text-sm focus:border-teal-600 focus:outline-none bg-slate-50"
          >
            {sessions.map((sess) => (
              <option key={sess.id} value={sess.id}>
                {sess.token_number} • {sess.patients?.name || 'Patient'} (
                {sess.department === 'ayush' ? 'AYUSH' : 'General OPD'})
              </option>
            ))}
          </select>
          <button
            onClick={loadSessions}
            className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline cursor-pointer"
          >
            ↻ Refresh Queue
          </button>
        </div>

        {/* Patient Identity Pills + Write Rx button */}
        {activeSessionItem && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-teal-950 bg-teal-50 border border-teal-200 px-3 py-1 rounded-xl">
              Token: {activeSessionItem.token_number}
            </span>
            <span className="text-sm font-extrabold text-slate-800">
              {activePatient?.name || 'Walk-in Patient'}
            </span>
            {activePatient?.gender && (
              <span className="text-xs font-semibold text-slate-600 uppercase bg-slate-100 px-2 py-1 rounded-lg">
                {activePatient.gender}
              </span>
            )}
            {activeSessionItem.department === 'ayush' ? (
              <span className="text-xs font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg">
                🌿 AYUSH (Ayurveda)
              </span>
            ) : (
              <span className="text-xs font-bold text-teal-900 bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg">
                🏥 General OPD
              </span>
            )}

            {/* ── Write Prescription (RxPad) Button ── */}
            <button
              id="btn-open-rxpad"
              type="button"
              onClick={() => setShowRxPad(true)}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs sm:text-sm shadow-md cursor-pointer transition-colors active:scale-95"
            >
              <span className="text-base">℞</span>
              <span>Write Prescription</span>
            </button>

            {/* ── View Body Map Button ── */}
            <button
              id="btn-open-body-map-clinician"
              type="button"
              onClick={() => setShowClinicianBodyMap(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-extrabold text-xs sm:text-sm border border-amber-300 shadow-xs cursor-pointer transition-colors active:scale-95"
              title="Open Interactive Body Pain Map"
            >
              <span className="text-base">🫀</span>
              <span>Body Map</span>
            </button>

            {/* ── Auto-Triage Badge ── */}
            {triageRouting && (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1.5 rounded-xl border ${
                  triageRouting.isEmergency
                    ? 'bg-red-100 text-red-900 border-red-300 animate-pulse'
                    : `${triageRouting.urgencyColor} ${triageRouting.urgencyTextColor} border-current/20`
                }`}
                title={`AI Auto-Triaged at ${new Date(triageRouting.triaged_at ?? '').toLocaleTimeString()}`}
              >
                <span>🦠 Auto-Triage:</span>
                <span>{triageRouting.room}</span>
                <span>•</span>
                <span>{triageRouting.specialty}</span>
              </span>
            )}
          </div>
        )}

        {/* Rx Saved confirmation badge */}
        {rxSavedMsg && (
          <div className="bg-teal-50 border border-teal-300 text-teal-800 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2">
            <span>✓</span><span>{rxSavedMsg}</span>
            <button onClick={() => setRxSavedMsg(null)} className="ml-auto text-teal-600 hover:text-teal-900 cursor-pointer">✕</button>
          </div>
        )}
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* ── 3. PROMINENT RED FLAG EMERGENCY BANNER ───────────────────── */}
        {hasRedFlags && (
          <div
            id="banner-red-flags"
            className="w-full bg-red-50 border-3 border-red-500 rounded-2xl p-5 shadow-lg relative overflow-hidden"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center text-2xl shrink-0 animate-pulse">
                🚨
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-black text-red-950 uppercase tracking-wide flex items-center gap-2">
                    <span>Clinical Red Flag Escalation</span>
                    <span className="bg-red-700 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
                      Immediate Physician Attention
                    </span>
                  </h3>
                  <span className="text-xs font-mono text-red-700">
                    Triggered at: {new Date(redFlags[0].triggered_at).toLocaleTimeString()}
                  </span>
                </div>

                <div className="space-y-1.5 mt-2">
                  {redFlags.map((rf, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-white border border-red-200 flex items-center justify-between"
                    >
                      <p className="text-sm font-bold text-red-900">{rf.detail}</p>
                      <span className="text-xs font-extrabold uppercase bg-red-100 text-red-800 px-2 py-0.5 rounded-md">
                        {rf.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success message banner */}
        {saveSuccessMsg && (
          <div className="w-full bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold px-4 py-3 rounded-xl flex items-center gap-2 shadow-xs">
            <span>✓</span>
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* ── 4. MAIN EHR CLINICAL RECORD CARD ──────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
          {/* Record Card Toolbar */}
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span>Structured Pre-Consultation Clinical Summary</span>
                {summaryRecord?.physician_edited && (
                  <span className="text-xs font-extrabold bg-blue-100 text-blue-900 border border-blue-300 px-2.5 py-0.5 rounded-full">
                    ✓ Verified by Physician
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                AI Structured Schema • Auto-aggregated from patient history, documents & assessment
              </p>
            </div>

            {/* Edit / Save Controls */}
            <div className="flex items-center gap-3">
              {!isEditMode ? (
                <button
                  id="btn-edit-summary"
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center gap-2 cursor-pointer shadow-xs transition-all"
                >
                  <span>✏️</span>
                  <span>Edit Clinical Record</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditMode(false)
                      setEditedSummary(JSON.parse(JSON.stringify(summaryData)))
                    }}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-save-summary"
                    type="button"
                    onClick={handleSaveEdits}
                    disabled={isSavingEdit}
                    className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-sm flex items-center gap-2 cursor-pointer shadow-md transition-all disabled:opacity-50"
                  >
                    <span>💾</span>
                    <span>{isSavingEdit ? 'Saving...' : 'Accept & Save'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Record Body Content */}
          {isLoadingSummary ? (
            <div className="p-12 text-center text-slate-500 animate-pulse">
              <span className="text-3xl mb-2 block">⏳</span>
              <p className="font-bold">Loading patient clinical record...</p>
            </div>
          ) : !summaryData ? (
            <div className="p-12 text-center text-slate-500">
              <p className="font-bold">No clinical summary generated yet for this session.</p>
            </div>
          ) : (
            <div className="p-6 sm:p-8 space-y-6">
              {/* Section 1: Chief Complaint */}
              <div className="border-b border-slate-100 pb-5">
                <span className="text-xs font-black uppercase text-teal-800 tracking-wider block mb-1">
                  1. Chief Complaint (मुख्य समस्या)
                </span>
                {!isEditMode ? (
                  <p id="field-chief-complaint" className="text-lg font-bold text-slate-900">
                    {summaryData.chief_complaint}
                  </p>
                ) : (
                  <input
                    id="input-edit-chief-complaint"
                    type="text"
                    value={editedSummary?.chief_complaint || ''}
                    onChange={(e) =>
                      setEditedSummary((prev) =>
                        prev ? { ...prev, chief_complaint: e.target.value } : prev
                      )
                    }
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-teal-500 font-bold text-slate-900 text-base focus:outline-none"
                  />
                )}
              </div>

              {/* Section 2: HPI */}
              <div className="border-b border-slate-100 pb-5">
                <span className="text-xs font-black uppercase text-teal-800 tracking-wider block mb-1">
                  2. History of Present Illness (HPI / SOCRATES)
                </span>
                {!isEditMode ? (
                  <p id="field-hpi" className="text-base text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                    {summaryData.hpi}
                  </p>
                ) : (
                  <textarea
                    id="input-edit-hpi"
                    rows={3}
                    value={editedSummary?.hpi || ''}
                    onChange={(e) =>
                      setEditedSummary((prev) =>
                        prev ? { ...prev, hpi: e.target.value } : prev
                      )
                    }
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-teal-500 font-medium text-slate-900 text-base focus:outline-none"
                  />
                )}
              </div>

              {/* Section 3: Past Medical & Surgical */}
              <div className="border-b border-slate-100 pb-5">
                <span className="text-xs font-black uppercase text-teal-800 tracking-wider block mb-1">
                  3. Past Medical & Surgical History (पूर्व रोग एवं शल्य इतिहास)
                </span>
                {!isEditMode ? (
                  <p id="field-past-medical" className="text-base text-slate-800 font-medium">
                    {summaryData.past_medical_surgical}
                  </p>
                ) : (
                  <textarea
                    id="input-edit-past-medical"
                    rows={2}
                    value={editedSummary?.past_medical_surgical || ''}
                    onChange={(e) =>
                      setEditedSummary((prev) =>
                        prev ? { ...prev, past_medical_surgical: e.target.value } : prev
                      )
                    }
                    className="w-full px-4 py-2 rounded-xl border-2 border-teal-500 font-medium text-slate-900 text-sm focus:outline-none"
                  />
                )}
              </div>

              {/* Section 4: Drug & Allergy */}
              <div className="border-b border-slate-100 pb-5">
                <span className="text-xs font-black uppercase text-teal-800 tracking-wider block mb-1">
                  4. Current Medications & Allergies (नियमित दवाइयाँ व एलर्जी)
                </span>
                {!isEditMode ? (
                  <p id="field-drug-allergy" className="text-base text-slate-800 font-medium">
                    {summaryData.drug_allergy}
                  </p>
                ) : (
                  <textarea
                    id="input-edit-drug-allergy"
                    rows={2}
                    value={editedSummary?.drug_allergy || ''}
                    onChange={(e) =>
                      setEditedSummary((prev) =>
                        prev ? { ...prev, drug_allergy: e.target.value } : prev
                      )
                    }
                    className="w-full px-4 py-2 rounded-xl border-2 border-teal-500 font-medium text-slate-900 text-sm focus:outline-none"
                  />
                )}
              </div>

              {/* Section 5 & 6: Family & Personal History */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-b border-slate-100 pb-5">
                <div>
                  <span className="text-xs font-black uppercase text-teal-800 tracking-wider block mb-1">
                    5. Family History
                  </span>
                  {!isEditMode ? (
                    <p className="text-sm text-slate-800 font-medium">{summaryData.family_history}</p>
                  ) : (
                    <input
                      type="text"
                      value={editedSummary?.family_history || ''}
                      onChange={(e) =>
                        setEditedSummary((prev) =>
                          prev ? { ...prev, family_history: e.target.value } : prev
                        )
                      }
                      className="w-full px-3 py-2 rounded-xl border-2 border-teal-500 font-medium text-slate-900 text-sm focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <span className="text-xs font-black uppercase text-teal-800 tracking-wider block mb-1">
                    6. Personal & Social History
                  </span>
                  {!isEditMode ? (
                    <p className="text-sm text-slate-800 font-medium">{summaryData.personal_history}</p>
                  ) : (
                    <input
                      type="text"
                      value={editedSummary?.personal_history || ''}
                      onChange={(e) =>
                        setEditedSummary((prev) =>
                          prev ? { ...prev, personal_history: e.target.value } : prev
                        )
                      }
                      className="w-full px-3 py-2 rounded-xl border-2 border-teal-500 font-medium text-slate-900 text-sm focus:outline-none"
                    />
                  )}
                </div>
              </div>

              {/* Section 7: Review of Systems */}
              <div className="border-b border-slate-100 pb-5">
                <span className="text-xs font-black uppercase text-teal-800 tracking-wider block mb-1">
                  7. Review of Systems (ROS)
                </span>
                {!isEditMode ? (
                  <p className="text-sm text-slate-800 font-medium">{summaryData.review_of_systems}</p>
                ) : (
                  <textarea
                    rows={2}
                    value={editedSummary?.review_of_systems || ''}
                    onChange={(e) =>
                      setEditedSummary((prev) =>
                        prev ? { ...prev, review_of_systems: e.target.value } : prev
                      )
                    }
                    className="w-full px-4 py-2 rounded-xl border-2 border-teal-500 font-medium text-slate-900 text-sm focus:outline-none"
                  />
                )}
              </div>

              {/* Section 8: AYUSH Ayurvedic Clinical Pillar Assessment (If Applicable) */}
              {(isAyushDept || summaryData.ayush) && (
                <div id="section-ayush-assessment" className="bg-emerald-50/60 border-2 border-emerald-300 rounded-2xl p-5 mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">🌿</span>
                    <h3 className="text-base font-extrabold text-emerald-950 uppercase tracking-wide">
                      8. AYUSH Ayurvedic Clinical Assessment (आयुर्वेदिक परीक्षण)
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-emerald-200">
                      <span className="font-bold text-slate-500 block mb-1">प्रकृति (Prakriti):</span>
                      <p className="font-bold text-slate-900 text-sm">
                        {summaryData.ayush?.prakriti?.answer || summaryData.ayush?.prakriti?.constitution || 'Not assessed'}
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-emerald-200">
                      <span className="font-bold text-slate-500 block mb-1">विकृति (Vikriti):</span>
                      <p className="font-bold text-slate-900 text-sm">
                        {summaryData.ayush?.vikriti?.answer || summaryData.ayush?.vikriti?.imbalance || 'Not assessed'}
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-emerald-200">
                      <span className="font-bold text-slate-500 block mb-1">जठराग्नि (Agni) & कोष्ठ (Koshtha):</span>
                      <p className="font-bold text-slate-900 text-sm">
                        Agni: <span className="text-emerald-800">{summaryData.ayush?.agni || 'samagni'}</span> | Koshtha:{' '}
                        <span className="text-emerald-800">{summaryData.ayush?.koshtha || 'madhyama'}</span>
                      </p>
                    </div>
                  </div>

                  {summaryData.ayush?.ahara_vihara && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-emerald-200 text-xs">
                      <span className="font-bold text-slate-500 block mb-0.5">आहार-विहार (Diet & Lifestyle Routine):</span>
                      <p className="font-bold text-slate-900">
                        {summaryData.ayush.ahara_vihara?.answer || summaryData.ayush.ahara_vihara?.routine || 'Regular routine'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Section 9: Prior Scanned Investigations Summary */}
              <div className="border-b border-slate-100 pb-5">
                <span className="text-xs font-black uppercase text-teal-800 tracking-wider block mb-2">
                  9. Prior Scanned Investigations & Document Extracts
                </span>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                  <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {summaryData.prior_investigations_summary}
                  </pre>
                </div>
              </div>

              {/* ── 5. CHRONOLOGICAL LIST OF PATIENT'S PRIOR DOCUMENTS ─────── */}
              {scannedDocuments.length > 0 && (
                <div>
                  <h4 className="text-sm font-extrabold uppercase text-slate-700 tracking-wider mb-3 flex items-center gap-2">
                    <span>📑</span>
                    <span>Scanned Document Artifacts ({scannedDocuments.length})</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {scannedDocuments.map((doc, idx) => {
                      const s = doc.structured_json || {}
                      const meds = s.medications || []
                      const labs = s.lab_results || []

                      return (
                        <div
                          key={doc.id || idx}
                          className="p-4 rounded-2xl bg-white border-2 border-slate-200 shadow-xs"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase bg-teal-100 text-teal-900 px-2 py-0.5 rounded">
                              {s.doc_type || doc.doc_type}
                            </span>
                            <span className="text-xs font-semibold text-slate-500">
                              📅 {s.date_on_document || new Date(doc.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          {s.hospital_name && (
                            <p className="text-xs font-bold text-slate-800 mb-2">{s.hospital_name}</p>
                          )}

                          {meds.length > 0 && (
                            <div className="mb-2 text-xs">
                              <span className="font-bold text-slate-500 block">Medications:</span>
                              <ul className="list-disc list-inside text-slate-800 font-medium">
                                {meds.map((m: any, i: number) => (
                                  <li key={i}>
                                    {m.name} ({m.dose}) — {m.frequency}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {labs.length > 0 && (
                            <div className="text-xs">
                              <span className="font-bold text-slate-500 block">Lab Findings:</span>
                              <div className="space-y-1 mt-1">
                                {labs.map((l: any, i: number) => (
                                  <div key={i} className="flex justify-between font-mono text-[11px]">
                                    <span>{l.test}:</span>
                                    <span className={l.flag !== 'normal' ? 'font-bold text-red-600' : 'text-slate-800'}>
                                      {l.value} {l.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── 6. PHYSICIAN PRIVATE CLINICAL NOTES & PRESCRIPTION ─────── */}
              <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-5">
                <span className="text-xs font-black uppercase text-slate-700 tracking-wider block mb-2">
                  Physician Consultation Notes & Final Rx (चिकित्सक परामर्श टिप्पणी)
                </span>
                <textarea
                  id="textarea-physician-notes"
                  rows={3}
                  value={physicianNotes}
                  onChange={(e) => setPhysicianNotes(e.target.value)}
                  placeholder="Enter physician assessment, clinical findings, prescription additions, or referral notes..."
                  className="w-full p-4 rounded-xl border border-slate-300 font-medium text-slate-900 text-sm focus:border-teal-600 focus:outline-none bg-white"
                />

                {isEditMode && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveEdits}
                      disabled={isSavingEdit}
                      className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                    >
                      <span>💾</span>
                      <span>Accept & Save Changes</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── RXPAD PRESCRIPTION MODAL ─────────────────────────────────── */}
      {showRxPad && (
        <RxPad
          patientName={activePatient?.name || 'Walk-in Patient'}
          patientId={activePatient?.abha_id || activePatient?.id?.slice(0, 8).toUpperCase() || '—'}
          sessionId={selectedSessionId}
          department={
            activeSessionItem?.department === 'ayush' ? 'AYUSH (Ayurveda) OPD' : 'General Medicine OPD'
          }
          onSave={(rxText) => {
            setShowRxPad(false)
            setRxSavedMsg(`Prescription saved for ${activePatient?.name || 'patient'} at ${new Date().toLocaleTimeString('en-IN')}`)
            // Optionally persist to Supabase physician_notes
            if (selectedSessionId) {
              supabase
                .from('clinical_summaries')
                .upsert(
                  { session_id: selectedSessionId, physician_notes: rxText, physician_edited: true },
                  { onConflict: 'session_id' }
                )
                .then(({ error }) => {
                  if (error) console.warn('Could not save Rx to session:', error.message)
                })
            }
          }}
          onClose={() => setShowRxPad(false)}
        />
      )}

      {/* ── CLINICIAN BODY PAIN MAP MODAL ─────────────────────────────── */}
      {showClinicianBodyMap && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>🫀</span>
                  <span>Interactive Body Pain Map</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <span className="font-bold text-slate-800">{activePatient?.name || 'Current Patient'}</span> • Token: <span className="font-bold text-slate-800">{activeSessionItem?.token_number}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClinicianBodyMap(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>
            <BodyPainMap
              language="en"
              onSelectionComplete={(summary, _rawIds) => {
                setShowClinicianBodyMap(false)
                setPhysicianNotes((prev) => (prev ? `${prev}\n[Pain Zones: ${summary}]` : `[Pain Zones: ${summary}]`))
              }}
              onSkip={() => setShowClinicianBodyMap(false)}
            />
          </div>
        </div>
      )}

      {/* ── HOSPITAL EMERGENCY RESPONSE & SOS DISPATCH CONSOLE MODAL ── */}
      {isSosConsoleOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white rounded-3xl border border-slate-700 shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto flex flex-col">
            {/* Console Header */}
            <div className="p-6 border-b border-slate-800 bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl animate-pulse">🚨</span>
                  <span className="text-xs font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-rose-600/30 text-rose-300 border border-rose-500/40">
                    Emergency Dispatch System
                  </span>
                </div>
                <h2 className="text-xl font-black tracking-tight text-white">
                  Hospital Emergency &amp; Patient SOS Monitor
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time telemetry and responder dispatch tracking from OPD Kiosks &amp; Waiting Zones
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="btn-simulate-sos-demo"
                  type="button"
                  onClick={handleSimulateDemoSos}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-amber-950 font-black text-xs cursor-pointer shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                  title="Simulate a real patient pressing SOS at the Kiosk"
                >
                  <span>⚡</span>
                  <span>Simulate SOS (Demo)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSosConsoleOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center cursor-pointer text-sm"
                  aria-label="Close SOS Console"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Console Body */}
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Alert Count Stats Bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3.5 text-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Active Emergency</span>
                  <span className={`text-2xl font-black font-mono ${liveSosAlerts.filter(a => !a.acknowledged).length > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-200'}`}>
                    {liveSosAlerts.filter(a => !a.acknowledged).length}
                  </span>
                </div>
                <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3.5 text-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Acknowledged / En Route</span>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    {liveSosAlerts.filter(a => a.acknowledged).length}
                  </span>
                </div>
                <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3.5 text-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Recorded</span>
                  <span className="text-2xl font-black font-mono text-teal-300">
                    {liveSosAlerts.length}
                  </span>
                </div>
              </div>

              {/* Incidents List */}
              {liveSosAlerts.length === 0 ? (
                <div className="p-8 text-center bg-slate-800/40 border border-slate-800 rounded-2xl">
                  <span className="text-4xl block mb-2">🟢</span>
                  <h4 className="text-base font-extrabold text-white">All Clear — No Active SOS Incidents</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
                    Patients in the lobby can press the red "Call for Help" button on any kiosk. When triggered, immediate visual alarms, audio chimes, and dispatched responder telemetry will appear here.
                  </p>
                  <button
                    type="button"
                    onClick={handleSimulateDemoSos}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs cursor-pointer shadow-md inline-flex items-center gap-2"
                  >
                    <span>🚨</span>
                    <span>Trigger Test SOS Incident Now</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {liveSosAlerts.map((alert) => (
                    <div
                      key={alert.incidentId}
                      className={`rounded-2xl border p-5 transition-all ${
                        alert.acknowledged
                          ? 'bg-slate-800/70 border-emerald-500/50'
                          : 'bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-950/50 ring-1 ring-rose-500/40'
                      }`}
                    >
                      {/* Incident Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-700/80 mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">
                            {alert.acknowledged ? '✅' : '🚨'}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-black text-rose-300">
                                {alert.incidentId}
                              </span>
                              <span
                                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  alert.acknowledged
                                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-rose-600 text-white animate-pulse'
                                }`}
                              >
                                {alert.acknowledged ? 'Responders Dispatched' : 'Pending Response'}
                              </span>
                            </div>
                            <span className="text-xs text-slate-300 font-semibold block mt-0.5">
                              📍 {alert.kioskId}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] text-slate-400 block font-mono">
                            {new Date(alert.triggeredAt).toLocaleTimeString('en-IN')}
                          </span>
                          {alert.acknowledged && alert.acknowledgedBy && (
                            <span className="text-[10px] text-emerald-400 font-semibold">
                              ✓ Ack by: {alert.acknowledgedBy}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Patient Context */}
                      <div className="bg-slate-900/60 rounded-xl p-3 mb-3 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Patient Details</span>
                          <span className="font-extrabold text-white text-sm">
                            {alert.patientName || 'Walk-in Patient'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">OPD Token</span>
                          <span className="font-mono font-black text-teal-300">
                            {alert.patientToken || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Dispatch Status</span>
                          <span className="font-extrabold text-amber-300">
                            Code Blue Escort Active
                          </span>
                        </div>
                      </div>

                      {/* Dispatched Hospital Personnel Cards */}
                      <div className="space-y-1.5 mb-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Automated Hospital Response Team Dispatched:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {(alert.staffDispatched || DEMO_STAFF).map((st, sIdx) => (
                            <div key={sIdx} className="bg-slate-800/90 border border-slate-700 rounded-xl p-2.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-black text-slate-200">{st.name}</span>
                                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                                  ETA ~{st.eta}s
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 block mt-0.5">{st.role}</span>
                              <span className="text-[10px] text-teal-400 font-mono block mt-1">📞 {st.phone}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Clinician Action Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/60">
                        {!alert.acknowledged && (
                          <button
                            id={`btn-modal-ack-${alert.incidentId}`}
                            type="button"
                            onClick={() => handleAcknowledgeSos(alert.incidentId)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs cursor-pointer shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                          >
                            <span>✓</span>
                            <span>Acknowledge &amp; Confirm Responders</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDismissSos(alert.incidentId)}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer border border-slate-700"
                        >
                          Archive / Clear
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Console Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Telemetry Connected • OPD Broadcast Mesh Active</span>
              </span>
              <button
                type="button"
                onClick={() => setIsSosConsoleOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
              >
                Close Console
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

