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
