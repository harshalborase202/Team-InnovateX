-- ====================================================================
-- Migration: Enable Kiosk Anon READ Access for documents & clinical_summaries
-- 
-- Problem: Migration 02 added anon-permissive policies for patients, sessions,
-- consents, history_responses, red_flags, and ayush_history — but NOT for
-- documents and clinical_summaries. This causes:
--   1. Doctor demo logins (no Supabase auth JWT) to see zero OCR documents
--   2. Patient portal to fail fetching document counts per session
--
-- Fix: Add anon-readable SELECT policies on documents and clinical_summaries,
-- matching the same pattern used for sessions in migration 02.
-- ====================================================================

-- 1. DOCUMENTS: Allow anon/kiosk to read documents (OCR results visible to doctor portal)
DROP POLICY IF EXISTS "documents_select_kiosk_anon" ON public.documents;
CREATE POLICY "documents_select_kiosk_anon"
  ON public.documents FOR SELECT
  USING (true);

-- 2. DOCUMENTS: Allow anon/kiosk to insert documents (scan screen uploads)
DROP POLICY IF EXISTS "documents_insert_kiosk_anon" ON public.documents;
CREATE POLICY "documents_insert_kiosk_anon"
  ON public.documents FOR INSERT
  WITH CHECK (true);

-- 3. DOCUMENTS: Allow anon/kiosk to update documents (OCR status + structured_json)
DROP POLICY IF EXISTS "documents_update_kiosk_anon" ON public.documents;
CREATE POLICY "documents_update_kiosk_anon"
  ON public.documents FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 4. CLINICAL SUMMARIES: Allow anon/kiosk to read summaries (doctor portal)
DROP POLICY IF EXISTS "clinical_summaries_select_kiosk_anon" ON public.clinical_summaries;
CREATE POLICY "clinical_summaries_select_kiosk_anon"
  ON public.clinical_summaries FOR SELECT
  USING (true);

-- 5. CLINICAL SUMMARIES: Allow anon/kiosk to insert summaries (AI summary generation)
DROP POLICY IF EXISTS "clinical_summaries_insert_kiosk_anon" ON public.clinical_summaries;
CREATE POLICY "clinical_summaries_insert_kiosk_anon"
  ON public.clinical_summaries FOR INSERT
  WITH CHECK (true);

-- 6. CLINICAL SUMMARIES: Allow anon/kiosk to update summaries (physician edits, AI re-generation)
DROP POLICY IF EXISTS "clinical_summaries_update_kiosk_anon" ON public.clinical_summaries;
CREATE POLICY "clinical_summaries_update_kiosk_anon"
  ON public.clinical_summaries FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 7. HISTORY RESPONSES: Ensure anon can also read history (for summary generation)
DROP POLICY IF EXISTS "history_responses_select_kiosk_anon" ON public.history_responses;
CREATE POLICY "history_responses_select_kiosk_anon"
  ON public.history_responses FOR SELECT
  USING (true);

-- 8. RED FLAGS: Ensure anon can also read red flags (for clinician alert display)
DROP POLICY IF EXISTS "red_flags_select_kiosk_anon" ON public.red_flags;
CREATE POLICY "red_flags_select_kiosk_anon"
  ON public.red_flags FOR SELECT
  USING (true);

-- 9. AYUSH HISTORY: Ensure anon can also read ayush history
DROP POLICY IF EXISTS "ayush_history_select_kiosk_anon" ON public.ayush_history;
CREATE POLICY "ayush_history_select_kiosk_anon"
  ON public.ayush_history FOR SELECT
  USING (true);

-- 10. Fix documents doc_type constraint to also accept 'unclassified'
--     (the digitizeService.ts initially inserts doc_type='unclassified' before OCR classification)
ALTER TABLE public.documents 
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE public.documents 
  ADD CONSTRAINT documents_doc_type_check 
  CHECK (doc_type IN ('prescription', 'lab_report', 'discharge_summary', 'radiology_report', 'unclassified', 'other'));

-- 11. Ensure ocr_status constraint matches what the code saves (only 'completed', not 'done')
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_ocr_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_ocr_status_check
  CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed'));
