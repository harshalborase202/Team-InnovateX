export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type SessionStatus =
  | 'identify'
  | 'converse'
  | 'scan'
  | 'summarize'
  | 'consult'
  | 'done'
  | 'cancelled'

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'

export type DocumentType =
  | 'prescription'
  | 'lab_report'
  | 'discharge_summary'
  | 'radiology_report'
  | 'other'

export type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type RedFlagSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface Patient {
  id: string
  auth_user_id: string | null
  abha_id: string | null
  aadhaar_ref: string | null
  name: string
  dob: string | null
  gender: Gender | null
  preferred_language: string
  phone_number: string | null
  login_email: string | null
  address_json?: Json
  emergency_contact?: Json
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  patient_id: string
  kiosk_id: string
  department: string
  token_number: string | null
  status: SessionStatus
  started_at: string
  completed_at: string | null
  metadata?: Json
  created_at: string
  updated_at: string
}

export interface Consent {
  id: string
  session_id: string
  consent_type: string
  granted: boolean
  granted_at: string
  revoked_at: string | null
  audio_confirmation_url: string | null
  language_code: string
  created_at: string
}

export interface HistoryResponse {
  id: string
  session_id: string
  field_key: string
  field_value_json: Json
  source: 'voice' | 'touch'
  captured_at: string
  created_at: string
}

export interface RedFlag {
  id: string
  session_id: string
  flag_type: string
  severity: RedFlagSeverity
  detail: string
  triggered_at: string
  acknowledged_by: string | null
  acknowledged_at: string | null
  created_at: string
}

export interface DocumentRecord {
  id: string
  session_id: string
  storage_path: string
  doc_type: DocumentType
  ocr_status: OcrStatus
  ocr_raw_text: string | null
  structured_json: Json
  created_at: string
  updated_at: string
}

export interface ClinicalSummary {
  id: string
  session_id: string
  summary_json: Json
  summary_text_en: string | null
  summary_text_hi: string | null
  physician_edited: boolean
  physician_notes: string | null
  edited_by: string | null
  edited_at: string | null
  pushed_to_his_at: string | null
  abha_linked_at: string | null
  created_at: string
  updated_at: string
}

export interface AyushHistory {
  id: string
  session_id: string
  prakriti_json: Json
  vikriti_json: Json
  agni: string | null
  koshtha: string | null
  ahara_vihara_json: Json
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  session_id: string | null
  actor: string
  action: string
  details: Json
  timestamp: string
}
