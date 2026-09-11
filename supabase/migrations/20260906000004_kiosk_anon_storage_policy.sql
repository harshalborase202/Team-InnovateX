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
