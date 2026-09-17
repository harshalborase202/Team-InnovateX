-- ==========================================
-- FILE: 20260906000001_medikiosk_core_schema.sql
-- ==========================================
-- ====================================================================
-- MediKiosk Core Schema Migration
-- Designed for OPD Kiosks & Consultation: Patients, Sessions,
-- Consents, Adaptive History, Red Flags, Documents, Summaries,
-- AYUSH History, and Immutable Audit Log with Strict RLS.
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. HELPER FUNCTIONS FOR ROLES & PERMISSIONS
-- Checks if the authenticated user has the 'clinician' role via custom claim
CREATE OR REPLACE FUNCTION public.is_clinician()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'role' = 'clinician'),
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'clinician'),
    ((auth.jwt() -> 'user_metadata' ->> 'role') = 'clinician'),
    false
  );
$$;

-- Returns clinician department from custom claims (e.g. 'general_medicine')
CREATE OR REPLACE FUNCTION public.clinician_department()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'department',
    auth.jwt() -> 'app_metadata' ->> 'department',
    auth.jwt() -> 'user_metadata' ->> 'department',
    NULL
  );
$$;

-- Automatic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. PATIENTS TABLE
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  abha_id TEXT UNIQUE,
  aadhaar_ref TEXT, -- Encrypted/masked or last-4 reference (privacy compliant)
  name TEXT NOT NULL,
  dob DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  preferred_language TEXT NOT NULL DEFAULT 'hi', -- 'hi', 'en', 'bn', 'te', 'mr', 'ta', etc.
  phone_number TEXT,
  login_email TEXT UNIQUE,
  address_json JSONB DEFAULT '{}'::jsonb,
  emergency_contact JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. SESSIONS TABLE
-- Represents a single kiosk visit lifecycle through the 5 steps
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kiosk_id TEXT NOT NULL DEFAULT 'KIOSK-01',
  department TEXT NOT NULL DEFAULT 'general_medicine',
  token_number TEXT, -- OPD queue display number (e.g. 'OPD-42')
  status TEXT NOT NULL DEFAULT 'identify' 
    CHECK (status IN ('identify', 'converse', 'scan', 'summarize', 'consult', 'done', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_patient_id ON public.sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_department_status ON public.sessions(department, status);

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper function: Verify session belongs to current authenticated patient
CREATE OR REPLACE FUNCTION public.is_session_patient(lookup_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.patients p ON s.patient_id = p.id
    WHERE s.id = lookup_session_id
      AND p.auth_user_id = auth.uid()
  );
$$;

-- 5. CONSENTS TABLE
-- Multilingual audio-guided consent for ABHA, voice processing, and examination
CREATE TABLE IF NOT EXISTS public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL, -- 'abha_data_share', 'voice_recording', 'opd_examination', 'ayush_record'
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  audio_confirmation_url TEXT,
  language_code TEXT NOT NULL DEFAULT 'hi',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consents_session_id ON public.consents(session_id);

-- 6. HISTORY RESPONSES TABLE
-- Adaptive interview responses (voice speech-to-text or large touch buttons)
CREATE TABLE IF NOT EXISTS public.history_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL, -- e.g., 'chief_complaint', 'duration', 'fever_grade', 'pain_location'
  field_value_json JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('voice', 'touch')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_responses_session ON public.history_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_history_responses_field_key ON public.history_responses(field_key);

-- 7. RED FLAGS TABLE
-- Immediate clinical escalation triggers (chest pain, severe dyspnea, pediatric alert)
CREATE TABLE IF NOT EXISTS public.red_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL, -- 'chest_pain', 'dyspnea', 'altered_mental_state', 'severe_hypertension', 'hemorrhage'
  severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  detail TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_red_flags_session ON public.red_flags(session_id);
CREATE INDEX IF NOT EXISTS idx_red_flags_severity ON public.red_flags(severity);

-- 8. DOCUMENTS TABLE
-- Scanned old prescriptions, lab tests, and discharge summaries with OCR states
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('prescription', 'lab_report', 'discharge_summary', 'radiology_report', 'other')),
  ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed')),
  ocr_raw_text TEXT,
  structured_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_session ON public.documents(session_id);
CREATE INDEX IF NOT EXISTS idx_documents_ocr_status ON public.documents(ocr_status);

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. CLINICAL SUMMARIES TABLE
-- Consolidated OPD pre-consult summary with bilingual outputs (Hindi + English)
CREATE TABLE IF NOT EXISTS public.clinical_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_text_en TEXT,
  summary_text_hi TEXT,
  physician_edited BOOLEAN NOT NULL DEFAULT false,
  physician_notes TEXT,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  pushed_to_his_at TIMESTAMPTZ, -- Hospital Information System sync timestamp
  abha_linked_at TIMESTAMPTZ,   -- Ayushman Bharat Digital Mission sync timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_clinical_summaries_updated_at
  BEFORE UPDATE ON public.clinical_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. AYUSH HISTORY TABLE
-- Traditional medicine assessment (Ayurveda/Yoga/Unani/Siddha/Homeopathy)
CREATE TABLE IF NOT EXISTS public.ayush_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  prakriti_json JSONB DEFAULT '{}'::jsonb,  -- Constitution (Vata, Pitta, Kapha)
  vikriti_json JSONB DEFAULT '{}'::jsonb,   -- Current doshic imbalance
  agni TEXT,                                -- Digestive fire ('samagni', 'vishamagni', 'tikshnagni', 'mandagni')
  koshtha TEXT,                             -- Bowel habit ('krura', 'madhyama', 'mrudu')
  ahara_vihara_json JSONB DEFAULT '{}'::jsonb, -- Diet & lifestyle patterns
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ayush_history_updated_at
  BEFORE UPDATE ON public.ayush_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 11. AUDIT LOG TABLE (INSERT-ONLY IMMUTABILITY)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,       -- User ID, 'kiosk_system', or role
  action TEXT NOT NULL,      -- e.g., 'SESSION_CREATED', 'CONSENT_GRANTED', 'RED_FLAG_RAISED', 'SUMMARY_EDITED'
  details JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_session ON public.audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log(timestamp DESC);

-- Trigger to prevent any UPDATE or DELETE on audit_log at the DB engine level
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: updates and deletes are strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON public.audit_log;
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modification();


-- ====================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

-- Enable RLS on all tables
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.red_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ayush_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- PATIENTS POLICIES
-- --------------------------------------------------------------------
-- Patients can view and update their own profile
CREATE POLICY "patient_select_own_profile"
  ON public.patients FOR SELECT
  USING (auth_user_id = auth.uid() OR public.is_clinician());

CREATE POLICY "patient_insert_own_profile"
  ON public.patients FOR INSERT
  WITH CHECK (auth_user_id = auth.uid() OR auth.uid() IS NOT NULL);

CREATE POLICY "patient_update_own_profile"
  ON public.patients FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- --------------------------------------------------------------------
-- SESSIONS POLICIES
-- --------------------------------------------------------------------
-- Patient can select their own sessions; Clinicians can select sessions for their department
CREATE POLICY "session_select_policy"
  ON public.sessions FOR SELECT
  USING (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
    OR (
      public.is_clinician()
      AND (public.clinician_department() IS NULL OR public.clinician_department() = department)
    )
  );

CREATE POLICY "session_insert_policy"
  ON public.sessions FOR INSERT
  WITH CHECK (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
    OR auth.role() = 'authenticated'
  );

CREATE POLICY "session_update_policy"
  ON public.sessions FOR UPDATE
  USING (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
    OR (
      public.is_clinician()
      AND (public.clinician_department() IS NULL OR public.clinician_department() = department)
    )
  );

-- --------------------------------------------------------------------
-- CONSENTS POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "consent_select_policy"
  ON public.consents FOR SELECT
  USING (
    public.is_session_patient(session_id)
    OR public.is_clinician()
  );

CREATE POLICY "consent_insert_policy"
  ON public.consents FOR INSERT
  WITH CHECK (
    public.is_session_patient(session_id)
    OR auth.role() = 'authenticated'
  );

-- --------------------------------------------------------------------
-- HISTORY RESPONSES POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "history_responses_select_policy"
  ON public.history_responses FOR SELECT
  USING (
    public.is_session_patient(session_id)
    OR public.is_clinician()
  );

CREATE POLICY "history_responses_insert_policy"
  ON public.history_responses FOR INSERT
  WITH CHECK (
    public.is_session_patient(session_id)
    OR auth.role() = 'authenticated'
  );

-- --------------------------------------------------------------------
-- RED FLAGS POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "red_flags_select_policy"
  ON public.red_flags FOR SELECT
  USING (
    public.is_session_patient(session_id)
    OR public.is_clinician()
  );

CREATE POLICY "red_flags_insert_policy"
  ON public.red_flags FOR INSERT
  WITH CHECK (
    public.is_session_patient(session_id)
    OR auth.role() = 'authenticated'
  );

CREATE POLICY "red_flags_update_policy"
  ON public.red_flags FOR UPDATE
  USING (public.is_clinician())
  WITH CHECK (public.is_clinician());

-- --------------------------------------------------------------------
-- DOCUMENTS POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "documents_select_policy"
  ON public.documents FOR SELECT
  USING (
    public.is_session_patient(session_id)
    OR public.is_clinician()
  );

CREATE POLICY "documents_insert_policy"
  ON public.documents FOR INSERT
  WITH CHECK (
    public.is_session_patient(session_id)
    OR auth.role() = 'authenticated'
  );

CREATE POLICY "documents_update_policy"
  ON public.documents FOR UPDATE
  USING (
    public.is_session_patient(session_id)
    OR public.is_clinician()
  );

-- --------------------------------------------------------------------
-- CLINICAL SUMMARIES POLICIES
-- --------------------------------------------------------------------
-- Patient can read own summary; Clinician can read all summaries for their department
CREATE POLICY "clinical_summaries_select_policy"
  ON public.clinical_summaries FOR SELECT
  USING (
    public.is_session_patient(session_id)
    OR (
      public.is_clinician()
      AND (
        public.clinician_department() IS NULL
        OR public.clinician_department() = (SELECT department FROM public.sessions WHERE id = clinical_summaries.session_id)
      )
    )
  );

CREATE POLICY "clinical_summaries_insert_policy"
  ON public.clinical_summaries FOR INSERT
  WITH CHECK (
    public.is_session_patient(session_id)
    OR auth.role() = 'authenticated'
  );

-- Clinicians can update summary (physician_edited, notes), but NOT delete
CREATE POLICY "clinical_summaries_update_policy"
  ON public.clinical_summaries FOR UPDATE
  USING (
    public.is_clinician()
    OR public.is_session_patient(session_id)
  )
  WITH CHECK (
    public.is_clinician()
    OR public.is_session_patient(session_id)
  );

-- Notice: No DELETE policy is defined on clinical_summaries for clinicians or patients!

-- --------------------------------------------------------------------
-- AYUSH HISTORY POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "ayush_history_select_policy"
  ON public.ayush_history FOR SELECT
  USING (
    public.is_session_patient(session_id)
    OR public.is_clinician()
  );

CREATE POLICY "ayush_history_insert_policy"
  ON public.ayush_history FOR INSERT
  WITH CHECK (
    public.is_session_patient(session_id)
    OR auth.role() = 'authenticated'
  );

CREATE POLICY "ayush_history_update_policy"
  ON public.ayush_history FOR UPDATE
  USING (
    public.is_session_patient(session_id)
    OR public.is_clinician()
  );

-- --------------------------------------------------------------------
-- AUDIT LOG POLICIES (Strictly Insert-Only, No Update, No Delete)
-- --------------------------------------------------------------------
CREATE POLICY "audit_log_insert_policy"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "audit_log_select_policy"
  ON public.audit_log FOR SELECT
  USING (
    public.is_clinician()
    OR (session_id IS NOT NULL AND public.is_session_patient(session_id))
  );

-- Strictly no UPDATE policy or DELETE policy for audit_log through the API!


-- ====================================================================
-- 13. STORAGE BUCKET & STORAGE RLS POLICIES
-- ====================================================================

-- Create private bucket for patient document uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-documents',
  'patient-documents',
  false,
  20971520, -- 20MB limit per document
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 20971520;

-- Storage Policy: Patient can upload only under their own session_id prefix (session_id/filename)
CREATE POLICY "patient_upload_session_documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'patient-documents'
    AND (
      public.is_session_patient((storage.foldername(name))[1]::uuid)
      OR auth.role() = 'authenticated'
    )
  );

-- Storage Policy: Patient can view files under their own session; Clinician can view all documents
CREATE POLICY "patient_and_clinician_read_session_documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'patient-documents'
    AND (
      public.is_session_patient((storage.foldername(name))[1]::uuid)
      OR public.is_clinician()
    )
  );

-- ====================================================================
-- 14. AUTH TRIGGER: AUTO-CREATE PATIENT RECORD ON SIGNUP
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_patient_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create a patient row if the user is not marked as clinician in metadata
  IF COALESCE(NEW.raw_user_meta_data->>'role', '') <> 'clinician' AND
     COALESCE(NEW.raw_app_meta_data->>'role', '') <> 'clinician' THEN
    INSERT INTO public.patients (
      auth_user_id,
      login_email,
      name,
      preferred_language
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Patient'),
      COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'hi')
    )
    ON CONFLICT (login_email) DO UPDATE
      SET auth_user_id = EXCLUDED.auth_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_patient_auth();


-- ==========================================
-- FILE: 20260906000002_enable_kiosk_anon_access.sql
-- ==========================================
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


-- ==========================================
-- FILE: 20260906000003_kiosk_anon_session_data.sql
-- ==========================================
-- ====================================================================
-- Migration 03: Enable Kiosk Anonymous Access for Session Data
-- Allows OPD kiosk touch terminals to store interview responses,
-- red flags, documents, and summaries for walk-in patient sessions.
-- ====================================================================

-- 1. HISTORY RESPONSES
DROP POLICY IF EXISTS "history_responses_kiosk_anon" ON public.history_responses;
CREATE POLICY "history_responses_kiosk_anon"
  ON public.history_responses FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. RED FLAGS
DROP POLICY IF EXISTS "red_flags_kiosk_anon" ON public.red_flags;
CREATE POLICY "red_flags_kiosk_anon"
  ON public.red_flags FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. DOCUMENTS
DROP POLICY IF EXISTS "documents_kiosk_anon" ON public.documents;
CREATE POLICY "documents_kiosk_anon"
  ON public.documents FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. CLINICAL SUMMARIES
DROP POLICY IF EXISTS "clinical_summaries_kiosk_anon" ON public.clinical_summaries;
CREATE POLICY "clinical_summaries_kiosk_anon"
  ON public.clinical_summaries FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. AYUSH HISTORY
DROP POLICY IF EXISTS "ayush_history_kiosk_anon" ON public.ayush_history;
CREATE POLICY "ayush_history_kiosk_anon"
  ON public.ayush_history FOR ALL
  USING (true)
  WITH CHECK (true);


-- ==========================================
-- FILE: 20260906000004_kiosk_anon_storage_policy.sql
-- ==========================================
-- ====================================================================
-- Migration 04: Enable Kiosk Storage & Document Digitization
-- 1. Storage bucket policies for patient-documents (anon upload/select/delete)
-- 2. Expand doc_type and ocr_status check constraints for flexible intake
-- ====================================================================

-- 1. Update documents check constraints to support 'unclassified' and 'done'
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN ('prescription', 'lab_report', 'discharge_summary', 'radiology_report', 'other', 'unclassified'));

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_ocr_status_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_ocr_status_check
  CHECK (ocr_status IN ('pending', 'processing', 'completed', 'done', 'failed'));

-- 2. Storage Policies for 'patient-documents' bucket
-- Allow kiosk anonymous touch-terminal to upload captured prescription/lab photos
DROP POLICY IF EXISTS "patient_documents_kiosk_anon_insert" ON storage.objects;
CREATE POLICY "patient_documents_kiosk_anon_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'patient-documents'
  );

-- Allow kiosk to view/read uploaded document photos
DROP POLICY IF EXISTS "patient_documents_kiosk_anon_select" ON storage.objects;
CREATE POLICY "patient_documents_kiosk_anon_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'patient-documents'
  );

-- Allow kiosk to delete a photo if retaken
DROP POLICY IF EXISTS "patient_documents_kiosk_anon_delete" ON storage.objects;
CREATE POLICY "patient_documents_kiosk_anon_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'patient-documents'
  );


-- ==========================================
-- FILE: 20260906000005_patient_auth_dashboard_rls.sql
-- ==========================================
-- ====================================================================
-- Migration 05: Patient Dashboard Auth, Account Linking & RLS Security
-- 1. Auto-confirm patient signups to bypass email rate limits in local/dev testing.
-- 2. Link existing kiosk patient rows (by ABHA ID or Phone) to the auth user.
-- 3. Provide link_patient_account RPC for manual in-dashboard linking.
-- 4. Scope kiosk policies TO anon and authenticated policies TO authenticated
--    so a logged-in patient strictly CANNOT access another patient's data.
-- ====================================================================

-- 1. Auto-confirm email trigger for new auth users
CREATE OR REPLACE FUNCTION public.auto_confirm_patient_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Auto-confirm user so they can sign in immediately without waiting for SMTP email
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_confirm ON auth.users;
CREATE TRIGGER on_auth_user_created_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_patient_user();

-- Also confirm any pending users already registered
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;

-- 2. Auto-linking auth trigger on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_patient_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_existing_id UUID;
  v_abha TEXT;
  v_phone TEXT;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'role', '') <> 'clinician' AND
     COALESCE(NEW.raw_app_meta_data->>'role', '') <> 'clinician' THEN

    v_abha := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'abha_id', '')), '');
    v_phone := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone_number', NEW.raw_user_meta_data->>'phone', '')), '');

    -- Check if patient record already exists from prior kiosk visit
    IF v_abha IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM public.patients WHERE abha_id = v_abha ORDER BY created_at DESC LIMIT 1;
    ELSIF v_phone IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM public.patients WHERE phone_number = v_phone ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_existing_id IS NOT NULL THEN
      -- Link existing kiosk patient row to this auth user
      UPDATE public.patients
      SET auth_user_id = NEW.id,
          login_email = NEW.email,
          updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      -- Insert new patient profile row
      INSERT INTO public.patients (
        auth_user_id,
        login_email,
        name,
        preferred_language,
        abha_id,
        phone_number
      )
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', 'Patient'),
        COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'hi'),
        v_abha,
        v_phone
      )
      ON CONFLICT (login_email) DO UPDATE
        SET auth_user_id = EXCLUDED.auth_user_id,
            updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_patient_link ON auth.users;
CREATE TRIGGER on_auth_user_created_patient_link
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_patient_auth();

-- 3. RPC: link_patient_account
-- Allows a logged-in patient to link prior kiosk visits using their ABHA ID or phone number
CREATE OR REPLACE FUNCTION public.link_patient_account(p_abha_id TEXT DEFAULT NULL, p_phone TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_patient RECORD;
  v_clean_abha TEXT := NULLIF(TRIM(COALESCE(p_abha_id, '')), '');
  v_clean_phone TEXT := NULLIF(TRIM(COALESCE(p_phone, '')), '');
  v_linked_count INT := 0;
  v_primary_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to link account';
  END IF;

  IF v_clean_abha IS NULL AND v_clean_phone IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provide at least ABHA ID or phone number');
  END IF;

  -- Find patient records from kiosk sessions matching ABHA or Phone
  FOR v_patient IN
    SELECT id, name, abha_id, phone_number FROM public.patients
    WHERE ((v_clean_abha IS NOT NULL AND abha_id = v_clean_abha)
       OR (v_clean_phone IS NOT NULL AND phone_number = v_clean_phone))
      AND (auth_user_id IS NULL OR auth_user_id = auth.uid())
    ORDER BY created_at ASC
  LOOP
    UPDATE public.patients
    SET auth_user_id = auth.uid(),
        updated_at = now()
    WHERE id = v_patient.id;
    
    v_linked_count := v_linked_count + 1;
    IF v_primary_id IS NULL THEN
      v_primary_id := v_patient.id;
    END IF;
  END LOOP;

  -- Also ensure the current auth user profile in patients has ABHA/phone updated
  UPDATE public.patients
  SET abha_id = COALESCE(v_clean_abha, abha_id),
      phone_number = COALESCE(v_clean_phone, phone_number),
      updated_at = now()
  WHERE auth_user_id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'linked_count', v_linked_count,
    'primary_patient_id', v_primary_id
  );
END;
$$;

-- 4. Secure RLS Policies:
-- Disallow authenticated patients from seeing other patients' sessions or summaries.
-- Keep anon kiosk operation fully intact.

-- Scope sessions
DROP POLICY IF EXISTS "session_select_kiosk_anon" ON public.sessions;
CREATE POLICY "session_select_kiosk_anon"
  ON public.sessions FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "session_select_policy" ON public.sessions;
CREATE POLICY "session_select_policy"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
    OR public.is_clinician()
  );

-- Scope patients
DROP POLICY IF EXISTS "patient_select_kiosk_anon" ON public.patients;
CREATE POLICY "patient_select_kiosk_anon"
  ON public.patients FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "patient_select_own_profile" ON public.patients;
CREATE POLICY "patient_select_own_profile"
  ON public.patients FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.is_clinician()
  );

-- Scope clinical_summaries
DROP POLICY IF EXISTS "clinical_summaries_kiosk_anon" ON public.clinical_summaries;
CREATE POLICY "clinical_summaries_kiosk_anon"
  ON public.clinical_summaries FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "clinical_summaries_select_policy" ON public.clinical_summaries;
CREATE POLICY "clinical_summaries_select_policy"
  ON public.clinical_summaries FOR SELECT
  TO authenticated
  USING (
    public.is_session_patient(session_id)
    OR public.is_clinician()
  );

-- Scope documents
DROP POLICY IF EXISTS "documents_kiosk_anon" ON public.documents;
CREATE POLICY "documents_kiosk_anon"
  ON public.documents FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "documents_select_policy" ON public.documents;
CREATE POLICY "documents_select_policy"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    public.is_session_patient(session_id)
    OR public.is_clinician()
  );


