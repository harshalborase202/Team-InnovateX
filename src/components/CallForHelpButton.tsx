/**
 * CallForHelpButton.tsx
 * ──────────────────────
 * Live SOS / "Call for Help" UI with:
 *   - Real hospital dual-tone chime (Web Audio API)
 *   - Live incident ID + patient details
 *   - Staff dispatch with real ETA countdown timers
 *   - Simulated IoT/Pager gateway log
 *   - BroadcastChannel so clinician tab sees it instantly
 *   - Polls DB for real acknowledgement
 */
import React, { useState, useEffect, useRef } from 'react'
import { useKiosk } from '../context/KioskContext'
import { supabase } from '../lib/supabase'
import { playEmergencyChime, SOS_CHANNEL_NAME } from '../services/sosService'
import type { SosAlert } from '../services/sosService'

// ── Countdown timer per staff member ─────────────────────────────────────
function useCountdown(seconds: number, started: boolean): number {
  const [rem, setRem] = useState(seconds)
  useEffect(() => {
    if (!started) return
    setRem(seconds)
    const id = setInterval(() => setRem((p) => Math.max(0, p - 1)), 1000)
    return () => clearInterval(id)
  }, [started, seconds])
  return rem
}

interface StaffRowProps { name: string; role: string; phone: string; eta: number; started: boolean; idx: number }
const StaffRow: React.FC<StaffRowProps> = ({ name, role, phone, eta, started, idx }) => {
  const rem = useCountdown(eta, started)
  const arrived = rem === 0
  const icons = ['🏃‍♀️', '🙋‍♂️', '🛡️']
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-500 ${arrived ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
      <span className="text-2xl">{icons[idx % 3]}</span>
      <div className="flex-1 min-w-0">
        <p className="font-extrabold text-slate-900 text-sm truncate">{name}</p>
        <p className="text-xs text-slate-500 font-semibold">{role}</p>
        <p className="text-xs text-slate-400 font-mono">{phone}</p>
      </div>
      <div className="shrink-0 text-right">
        {arrived
          ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs">✓ Arrived</span>
          : <div><span className={`text-2xl font-black tabular-nums ${rem <= 15 ? 'text-amber-600 animate-pulse' : 'text-teal-700'}`}>{rem}s</span><p className="text-xs text-slate-400 font-semibold">ETA</p></div>
        }
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export const CallForHelpButton: React.FC = () => {
  const { t, language, isRedFlagActive, isHelpModalOpen, setIsHelpModalOpen, callForHelp, activeSosIncident, clearSosIncident } = useKiosk()

  const [dispatchStarted, setDispatchStarted] = useState(false)
  const [pagerSent, setPagerSent] = useState(false)
  const [callCount, setCallCount] = useState(0)
  const [localIncident, setLocalIncident] = useState<SosAlert | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bcRef   = useRef<BroadcastChannel | null>(null)

  // Sync from context
  useEffect(() => {
    if (activeSosIncident) setLocalIncident(activeSosIncident)
  }, [activeSosIncident])

  // Listen for acknowledge broadcasts from clinician tab
  useEffect(() => {
    try {
      const bc = new BroadcastChannel(SOS_CHANNEL_NAME)
      bcRef.current = bc
      bc.onmessage = (e) => {
        if (e.data?.type === 'SOS_ACKNOWLEDGED') {
          setLocalIncident((prev) => prev ? {
            ...prev,
            acknowledged: true,
            acknowledgedBy: e.data.by,
            acknowledgedAt: e.data.at,
          } : null)
        }
      }
      return () => { bc.close(); bcRef.current = null }
    } catch { /* unsupported */ }
  }, [])

  // Start animations
  useEffect(() => {
    if (isHelpModalOpen && localIncident) {
      const t1 = setTimeout(() => setDispatchStarted(true), 600)
      const t2 = setTimeout(() => setPagerSent(true), 1200)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [isHelpModalOpen, localIncident])

  // Poll DB for acknowledgement
  useEffect(() => {
    if (!isHelpModalOpen || !localIncident?.redFlagDbId) return
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('red_flags').select('acknowledged_at').eq('id', localIncident.redFlagDbId!).maybeSingle()
        if (data?.acknowledged_at) {
          setLocalIncident((prev) => prev ? { ...prev, acknowledged: true, acknowledgedBy: 'Clinician on Duty', acknowledgedAt: data.acknowledged_at } : null)
          clearInterval(pollRef.current!); pollRef.current = null
        }
      } catch { /* non-fatal */ }
    }, 4000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [isHelpModalOpen, localIncident?.redFlagDbId])

  const handleClose = () => {
    setIsHelpModalOpen(false)
    setDispatchStarted(false)
    setPagerSent(false)
    clearSosIncident()
    setLocalIncident(null)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const handleCallAgain = () => {
    if (callCount >= 2) return
    setCallCount((c) => c + 1)
    playEmergencyChime()
    callForHelp()
  }

  const timeStr = localIncident ? new Date(localIncident.triggeredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''

  if (isRedFlagActive) return null

  return (
    <>
      {/* ── Fixed SOS Trigger Button ─────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          id="btn-call-for-help"
          onClick={callForHelp}
          type="button"
          aria-label={t('callHelpAria')}
          className="group flex items-center gap-3 px-5 sm:px-6 py-3.5 sm:py-4 rounded-3xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-base sm:text-lg shadow-2xl border-2 border-rose-400 ring-4 ring-rose-100/70 active:scale-95 transition-all duration-200 cursor-pointer min-h-[56px] min-w-[56px]"
        >
          <span className="text-2xl sm:text-3xl animate-bounce" role="img" aria-hidden="true">🛎️</span>
          <div className="flex flex-col text-left">
            <span className="leading-tight tracking-wide font-black">{t('callForHelp')}</span>
            <span className="text-xs font-semibold text-rose-100 hidden sm:inline">{t('callStaff')}</span>
          </div>
        </button>
      </div>

      {/* ── Live SOS Incident Modal ────────────────────────────────── */}
      {isHelpModalOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="sos-modal-title"
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border-2 border-rose-300 overflow-hidden max-h-[96vh] overflow-y-auto">

            {/* Header */}
            <div className={`px-5 py-4 flex items-center justify-between ${localIncident?.acknowledged ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-3xl ${localIncident?.acknowledged ? '' : 'animate-pulse'}`}>
                  {localIncident?.acknowledged ? '✅' : '🚨'}
                </div>
                <div>
                  <h2 id="sos-modal-title" className="text-lg font-black text-white leading-tight">
                    {localIncident?.acknowledged
                      ? (language === 'mr' ? 'SOS मान्य — कर्मचारी येत आहेत' : language === 'hi' ? 'SOS स्वीकृत — कर्मचारी आ रहे हैं' : 'SOS Acknowledged — Staff Dispatched')
                      : (language === 'mr' ? 'SOS सक्रिय — कर्मचारी पाठवले जात आहेत' : language === 'hi' ? 'SOS सक्रिय — कर्मचारी भेजे जा रहे हैं' : 'SOS Active — Staff Being Dispatched')}
                  </h2>
                  {localIncident && (
                    <p className="text-xs text-white/80 font-mono font-bold">
                      {localIncident.incidentId} • {timeStr}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={handleClose} type="button" className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold flex items-center justify-center cursor-pointer" aria-label="Close">✕</button>
            </div>

            <div className="px-5 py-5 space-y-4">

              {/* Live status pill */}
              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border-2 ${localIncident?.acknowledged ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-200'}`}>
                <span className={`w-3 h-3 rounded-full shrink-0 ${localIncident?.acknowledged ? 'bg-emerald-500' : 'bg-rose-500 animate-ping'}`} />
                <span className={`font-extrabold text-sm ${localIncident?.acknowledged ? 'text-emerald-900' : 'text-rose-900'}`}>
                  {localIncident?.acknowledged
                    ? `✓ Acknowledged by ${localIncident.acknowledgedBy || 'Duty Staff'} — ${localIncident.acknowledgedAt ? new Date(localIncident.acknowledgedAt).toLocaleTimeString('en-IN') : ''}`
                    : (language === 'mr' ? 'सूचना पाठवली — कर्मचारी येत आहेत' : language === 'hi' ? 'सूचना भेजी गई — कर्मचारी आ रहे हैं' : 'Alert dispatched — Staff on their way to you')}
                </span>
              </div>

              {/* Patient + Kiosk Info */}
              {localIncident && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">📍 Location</p>
                    <p className="font-extrabold text-slate-900 text-xs mt-0.5">{localIncident.kioskId}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">🪪 Patient</p>
                    <p className="font-extrabold text-slate-900 text-xs mt-0.5">
                      {localIncident.patientName || 'Walk-in Patient'}
                      {localIncident.patientToken && <span className="text-slate-500"> • {localIncident.patientToken}</span>}
                    </p>
                  </div>
                </div>
              )}

              {/* Staff Dispatch with ETA countdown */}
              {localIncident && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">🏃 Dispatched Personnel</p>
                  <div className="space-y-2">
                    {localIncident.staffDispatched.map((s, i) => (
                      <StaffRow key={s.name} name={s.name} role={s.role} phone={s.phone} eta={s.eta} started={dispatchStarted} idx={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* IoT Gateway Log */}
              {pagerSent && localIncident && (
                <div className="bg-slate-900 rounded-2xl p-4 font-mono text-xs text-emerald-400 border border-slate-700 overflow-x-auto">
                  <p className="text-slate-400 mb-1.5 font-sans font-bold text-xs">📡 Hospital IoT Gateway Log</p>
                  <p className="text-emerald-300"><span className="text-slate-500">[{timeStr}]</span> SOS_TRIGGERED by Kiosk-01</p>
                  <p className="text-amber-300 mt-0.5"><span className="text-slate-500">[{timeStr}]</span> SMS dispatched → Nurse-in-Charge (+91 98201 XXXXX)</p>
                  <p className="text-amber-300 mt-0.5"><span className="text-slate-500">[{timeStr}]</span> Pager alert sent → Security Post 1</p>
                  {localIncident.redFlagDbId && (
                    <p className="text-teal-300 mt-0.5"><span className="text-slate-500">[{timeStr}]</span> DB: red_flag/{localIncident.redFlagDbId.slice(0,8)}… written ✓</p>
                  )}
                  {localIncident.acknowledged && (
                    <p className="text-emerald-300 mt-0.5"><span className="text-slate-500">[{timeStr}]</span> ACK received from Clinician Dashboard ✓</p>
                  )}
                  <p className="text-rose-300 mt-0.5"><span className="text-slate-500">[{timeStr}]</span> Incident {localIncident.incidentId} — {localIncident.acknowledged ? 'CLOSED' : 'ACTIVE'}</p>
                </div>
              )}

              {/* Reassurance */}
              <p className="text-center text-base text-slate-600 font-medium leading-relaxed">
                {language === 'mr' ? 'शांत राहा. आपण सुरक्षित आहात. कर्मचारी येत आहेत.'
                  : language === 'hi' ? 'शांत रहें। आप सुरक्षित हैं। कर्मचारी आ रहे हैं।'
                  : 'Please stay calm. You are safe. A staff member is on their way.'}
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button id="btn-dismiss-help" onClick={handleClose} type="button" className="flex-1 py-4 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-base shadow-md cursor-pointer transition-all active:scale-98 min-h-[52px]">
                  {t('dismissHelp')}
                </button>
                <button id="btn-call-again-help" onClick={handleCallAgain} type="button" disabled={callCount >= 2}
                  className="py-4 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold text-base border border-slate-300 cursor-pointer transition-all active:scale-98 min-h-[52px]">
                  {t('callAgain')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
