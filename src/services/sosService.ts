/**
 * sosService.ts
 * ─────────────
 * Real SOS dispatch service:
 *   1. Writes critical red_flag to Supabase
 *   2. Broadcasts via BroadcastChannel (instant, cross-tab, same browser — perfect for demo)
 *   3. Plays dual-tone hospital emergency chime via Web Audio API
 */

import { supabase } from '../lib/supabase'

// BroadcastChannel name — both kiosk and clinician tabs listen on this
export const SOS_CHANNEL_NAME = 'medikiosk_sos_alerts'

export interface SosAlert {
  incidentId: string
  redFlagDbId: string | null
  kioskId: string
  patientName: string | null
  patientToken: string | null
  triggeredAt: string        // ISO string
  acknowledged: boolean
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  staffDispatched: DispatchedStaff[]
}

export interface DispatchedStaff {
  name: string
  role: string
  eta: number   // seconds
  phone: string
}

// Demo staff roster (simulates real hospital)
export const DEMO_STAFF: DispatchedStaff[] = [
  { name: 'Sr. Sunita Patil',     role: 'Nurse-in-Charge',    eta: 60, phone: '+91 98201 XXXXX' },
  { name: 'Wardboy Rajesh Kumar', role: 'Patient Escort',      eta: 45, phone: '+91 97XXX XXXXX'  },
  { name: 'Security — Ramesh D.', role: 'Hospital Security',   eta: 30, phone: '+91 9XXXX X0001'  },
]

const KIOSK_LOCATION = 'Kiosk-01 • OPD Main Lobby — Floor 1'

function makeIncidentId(): string {
  return `INC-${Math.floor(1000 + Math.random() * 8999)}`
}

// ── Web Audio emergency chime (no audio files needed) ─────────────────────
export function playEmergencyChime(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const tones = [
      { f: 880, t: 0.00, d: 0.14 },
      { f: 660, t: 0.18, d: 0.14 },
      { f: 880, t: 0.36, d: 0.14 },
      { f: 440, t: 0.54, d: 0.28 },
    ]
    tones.forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator()
      const g   = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, ctx.currentTime + t)
      g.gain.setValueAtTime(0, ctx.currentTime + t)
      g.gain.linearRampToValueAtTime(0.55, ctx.currentTime + t + 0.02)
      g.gain.linearRampToValueAtTime(0,   ctx.currentTime + t + d)
      osc.connect(g); g.connect(ctx.destination)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + d + 0.05)
    })
    setTimeout(() => ctx.close(), 2000)
  } catch { /* silently ignore */ }
}

export const SOS_STORAGE_KEY = 'medikiosk_active_sos_alerts'

export function getLocalSosAlerts(): SosAlert[] {
  try {
    const raw = localStorage.getItem(SOS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SosAlert[]
  } catch {
    return []
  }
}

export function saveLocalSosAlert(alert: SosAlert): void {
  try {
    const current = getLocalSosAlerts().filter(a => a.incidentId !== alert.incidentId && a.redFlagDbId !== alert.redFlagDbId)
    const updated = [alert, ...current].slice(0, 10)
    localStorage.setItem(SOS_STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('medikiosk-sos-updated', { detail: alert }))
  } catch { /* ignore */ }
}

export function updateLocalSosAcknowledged(idOrDbId: string, byName: string): void {
  try {
    const current = getLocalSosAlerts()
    const now = new Date().toISOString()
    const updated = current.map(a => {
      if (a.incidentId === idOrDbId || a.redFlagDbId === idOrDbId || a.incidentId === `INC-${idOrDbId?.slice(0, 4).toUpperCase()}`) {
        return { ...a, acknowledged: true, acknowledgedBy: byName, acknowledgedAt: now }
      }
      return a
    })
    localStorage.setItem(SOS_STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('medikiosk-sos-updated'))
  } catch { /* ignore */ }
}

export function dismissLocalSosAlert(idOrDbId: string): void {
  try {
    const current = getLocalSosAlerts()
    const updated = current.filter(a => a.incidentId !== idOrDbId && a.redFlagDbId !== idOrDbId)
    localStorage.setItem(SOS_STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('medikiosk-sos-updated'))
  } catch { /* ignore */ }
}

// ── Trigger SOS — write to DB + broadcast to all tabs ────────────────────
export async function triggerSosIncident(
  sessionId: string | null,
  patientName: string | null,
  patientToken: string | null,
  language: string
): Promise<SosAlert> {
  playEmergencyChime()

  const incidentId   = makeIncidentId()
  const triggeredAt  = new Date().toISOString()
  let redFlagDbId: string | null = null

  const detail =
    language === 'mr'
      ? `रुग्ण ${patientName || 'Walk-in'} (${patientToken || '—'}) यांनी ${KIOSK_LOCATION} वर SOS दाबले (${incidentId})`
      : language === 'hi'
      ? `रोगी ${patientName || 'Walk-in'} (${patientToken || '—'}) ने ${KIOSK_LOCATION} पर SOS दबाया (${incidentId})`
      : `Patient ${patientName || 'Walk-in'} (${patientToken || '—'}) triggered SOS at ${KIOSK_LOCATION} (${incidentId})`

  // 1. Write to Supabase (if session exists)
  if (sessionId) {
    try {
      const { data } = await supabase
        .from('red_flags')
        .insert({
          session_id:   sessionId,
          flag_type:    'sos_call_for_help',
          severity:     'critical',
          detail,
          triggered_at: triggeredAt,
        })
        .select('id')
        .single()
      if (data) redFlagDbId = data.id

      // Audit log
      supabase.from('audit_log').insert({
        session_id: sessionId,
        actor:      'kiosk_patient',
        action:     'SOS_TRIGGERED',
        details:    { incident_id: incidentId, kiosk: KIOSK_LOCATION, patient: patientName, token: patientToken },
      }).then(() => {})
    } catch (err) {
      console.warn('SOS DB write non-fatal:', err)
    }
  }

  const alert: SosAlert = {
    incidentId,
    redFlagDbId,
    kioskId:          KIOSK_LOCATION,
    patientName,
    patientToken,
    triggeredAt,
    acknowledged:     false,
    acknowledgedBy:   null,
    acknowledgedAt:   null,
    staffDispatched:  DEMO_STAFF,
  }

  // 2. Persist to localStorage for cross-tab & tab-switch survivability
  saveLocalSosAlert(alert)

  // 3. Broadcast to ALL tabs (kiosk + clinician) via BroadcastChannel
  try {
    const bc = new BroadcastChannel(SOS_CHANNEL_NAME)
    bc.postMessage({ type: 'SOS_NEW', alert })
    bc.close()
  } catch { /* BroadcastChannel not supported — DB-only fallback */ }

  return alert
}

// ── Acknowledge from clinician side ──────────────────────────────────────
export async function acknowledgeSosIncident(
  alertIdOrDbId: string | null,
  acknowledgedByName: string = 'Dr. S. Sharma (Attending Physician)',
  clinicianUserId?: string | null
): Promise<boolean> {
  if (alertIdOrDbId) {
    updateLocalSosAcknowledged(alertIdOrDbId, acknowledgedByName)
    try {
      const patch: Record<string, unknown> = { acknowledged_at: new Date().toISOString() }
      if (clinicianUserId) patch.acknowledged_by = clinicianUserId
      await supabase.from('red_flags').update(patch).eq('id', alertIdOrDbId)
    } catch (err) {
      console.warn('SOS acknowledge DB non-fatal:', err)
    }
  }

  // Broadcast acknowledge so kiosk modal updates too
  try {
    const bc = new BroadcastChannel(SOS_CHANNEL_NAME)
    bc.postMessage({ type: 'SOS_ACKNOWLEDGED', redFlagDbId: alertIdOrDbId, by: acknowledgedByName, at: new Date().toISOString() })
    bc.close()
  } catch { /* ignore */ }

  return true
}

// ── Poll Supabase for recent SOS alerts (last 2 hours) ───────────────────
// Used as fallback when BroadcastChannel doesn't fire (cross-device)
export async function fetchRecentSosAlerts(): Promise<SosAlert[]> {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('red_flags')
      .select('id, detail, triggered_at, acknowledged_at, session_id, sessions(token_number, patients(name))')
      .eq('flag_type', 'sos_call_for_help')
      .gte('triggered_at', twoHoursAgo)
      .order('triggered_at', { ascending: false })
      .limit(5)

    if (error || !data) return []

    return data.map((row: any) => ({
      incidentId:      `INC-${row.id.slice(0, 4).toUpperCase()}`,
      redFlagDbId:     row.id,
      kioskId:         KIOSK_LOCATION,
      patientName:     row.sessions?.patients?.name || null,
      patientToken:    row.sessions?.token_number   || null,
      triggeredAt:     row.triggered_at,
      acknowledged:    !!row.acknowledged_at,
      acknowledgedBy:  row.acknowledged_at ? 'Clinician' : null,
      acknowledgedAt:  row.acknowledged_at || null,
      staffDispatched: DEMO_STAFF,
    }))
  } catch {
    return []
  }
}
