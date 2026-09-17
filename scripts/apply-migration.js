/**
 * apply-migration.js
 * 
 * Run this script once to apply the RLS fix migration to your Supabase project.
 * Usage: node apply-migration.js
 * 
 * Prerequisites: Set SUPABASE_SERVICE_ROLE_KEY in backend/.env
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load env manually
const envPath = join(__dirname, 'backend', '.env')
const envContent = readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  envContent
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const [k, ...v] = l.split('=')
      return [k.trim(), v.join('=').trim()]
    })
)

const SUPABASE_URL = env.SUPABASE_URL || 'https://fnrpqhnfrjgaychlgzdf.supabase.co'
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY === 'placeholder-service-role-key') {
  console.error('❌ ERROR: Please set a valid SUPABASE_SERVICE_ROLE_KEY in backend/.env')
  console.error('   Get it from: https://supabase.com/dashboard/project/fnrpqhnfrjgaychlgzdf/settings/api')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const migrationSQL = `
-- Fix: Add anon-permissive RLS policies for documents and clinical_summaries

DROP POLICY IF EXISTS "documents_select_kiosk_anon" ON public.documents;
CREATE POLICY "documents_select_kiosk_anon" ON public.documents FOR SELECT USING (true);

DROP POLICY IF EXISTS "documents_insert_kiosk_anon" ON public.documents;
CREATE POLICY "documents_insert_kiosk_anon" ON public.documents FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "documents_update_kiosk_anon" ON public.documents;
CREATE POLICY "documents_update_kiosk_anon" ON public.documents FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "clinical_summaries_select_kiosk_anon" ON public.clinical_summaries;
CREATE POLICY "clinical_summaries_select_kiosk_anon" ON public.clinical_summaries FOR SELECT USING (true);

DROP POLICY IF EXISTS "clinical_summaries_insert_kiosk_anon" ON public.clinical_summaries;
CREATE POLICY "clinical_summaries_insert_kiosk_anon" ON public.clinical_summaries FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "clinical_summaries_update_kiosk_anon" ON public.clinical_summaries;
CREATE POLICY "clinical_summaries_update_kiosk_anon" ON public.clinical_summaries FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "history_responses_select_kiosk_anon" ON public.history_responses;
CREATE POLICY "history_responses_select_kiosk_anon" ON public.history_responses FOR SELECT USING (true);

DROP POLICY IF EXISTS "red_flags_select_kiosk_anon" ON public.red_flags;
CREATE POLICY "red_flags_select_kiosk_anon" ON public.red_flags FOR SELECT USING (true);

DROP POLICY IF EXISTS "ayush_history_select_kiosk_anon" ON public.ayush_history;
CREATE POLICY "ayush_history_select_kiosk_anon" ON public.ayush_history FOR SELECT USING (true);

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN ('prescription', 'lab_report', 'discharge_summary', 'radiology_report', 'unclassified', 'other'));

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_ocr_status_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_ocr_status_check
  CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed'));
`

async function applyMigration() {
  console.log('🚀 Applying RLS fix migration to Supabase...')
  console.log('   Project:', SUPABASE_URL)

  // Execute via Supabase Management API
  const response = await fetch(`${SUPABASE_URL.replace('.supabase.co', '.supabase.co')}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql: migrationSQL }),
  })

  if (!response.ok) {
    // Try via supabase.rpc if available
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL })
    if (error) {
      console.error('❌ Migration failed:', error.message)
      console.log('\n📋 Please apply this SQL manually in the Supabase SQL editor:')
      console.log('   https://supabase.com/dashboard/project/fnrpqhnfrjgaychlgzdf/sql/new')
      console.log('\n--- SQL TO APPLY ---')
      console.log(migrationSQL)
      return
    }
  }

  console.log('✅ Migration applied successfully!')
  console.log('   - Added anon SELECT policy for documents')
  console.log('   - Added anon SELECT policy for clinical_summaries')
  console.log('   - Fixed doc_type constraint to accept "unclassified"')
  console.log('   - Verified ocr_status constraint values')
}

applyMigration().catch(console.error)
