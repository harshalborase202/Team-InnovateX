-- ====================================================================
-- Migration 02: Enable Kiosk Anonymous Access for Walk-in Patients
-- Hospital OPD kiosks operate as touch terminals where walk-in patients
-- identify via ABHA ID, Aadhaar, or demographic registration without
-- requiring prior email/password login.
-- ====================================================================

-- 1. PATIENTS: Allow kiosk to check existing patients and register new ones
DROP POLICY IF EXISTS "patient_insert_kiosk_anon" ON public.patients;
CREATE POLICY "patient_insert_kiosk_anon"
  ON public.patients FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "patient_select_kiosk_anon" ON public.patients;
CREATE POLICY "patient_select_kiosk_anon"
  ON public.patients FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "patient_update_kiosk_anon" ON public.patients;
CREATE POLICY "patient_update_kiosk_anon"
  ON public.patients FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 2. SESSIONS: Allow kiosk to create and advance session lifecycle
DROP POLICY IF EXISTS "session_insert_kiosk_anon" ON public.sessions;
CREATE POLICY "session_insert_kiosk_anon"
  ON public.sessions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "session_select_kiosk_anon" ON public.sessions;
CREATE POLICY "session_select_kiosk_anon"
  ON public.sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "session_update_kiosk_anon" ON public.sessions;
CREATE POLICY "session_update_kiosk_anon"
  ON public.sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 3. CONSENTS: Allow kiosk to record audio-guided consent
DROP POLICY IF EXISTS "consent_insert_kiosk_anon" ON public.consents;
CREATE POLICY "consent_insert_kiosk_anon"
  ON public.consents FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "consent_select_kiosk_anon" ON public.consents;
CREATE POLICY "consent_select_kiosk_anon"
  ON public.consents FOR SELECT
  USING (true);
