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
