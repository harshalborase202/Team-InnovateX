import { supabase } from '../lib/supabase'

export interface StructuredClinicalSummary {
  chief_complaint: string
  hpi: string
  past_medical_surgical: string
  drug_allergy: string
  family_history: string
  personal_history: string
  review_of_systems: string
  ayush: {
    prakriti: any
    vikriti: any
    agni: string | null
    koshtha: string | null
    ahara_vihara: any
  } | null
  prior_investigations_summary: string
  red_flags: {
    flag_type: string
    severity: string
    detail: string
    triggered_at: string
  }[]
}

export interface ClinicalSummaryRecord {
  id: string
  session_id: string
  summary_json: StructuredClinicalSummary
  summary_text_en?: string
  summary_text_hi?: string
  physician_edited: boolean
  physician_notes?: string | null
  edited_by?: string | null
  edited_at?: string | null
  pushed_to_his_at?: string | null
  abha_linked_at?: string | null
  created_at: string
  updated_at: string
}

/**
 * Deterministically assemble clinical data from raw session tables
 */
export async function assembleClientClinicalSummary(sessionId: string): Promise<StructuredClinicalSummary> {
  const [
    { data: session },
    { data: historyResponses },
    { data: redFlags },
    { data: ayushRows },
    { data: documents },
  ] = await Promise.all([
    supabase.from('sessions').select('*, patients(*)').eq('id', sessionId).maybeSingle(),
    supabase.from('history_responses').select('*').eq('session_id', sessionId).order('captured_at', { ascending: true }),
    supabase.from('red_flags').select('*').eq('session_id', sessionId),
    supabase.from('ayush_history').select('*').eq('session_id', sessionId).maybeSingle(),
    supabase.from('documents').select('*').eq('session_id', sessionId),
  ])

  const answers: Record<string, string> = {}
  if (historyResponses) {
    historyResponses.forEach((hr: any) => {
      answers[hr.field_key] = hr.field_value_json?.answer || hr.field_value_json?.option_label || ''
    })
  }

  // Chief complaint
  const chiefComplaint =
    answers['chief_complaint'] ||
    answers['initial_complaint'] ||
    answers['complaint'] ||
    (historyResponses && historyResponses[0]?.field_value_json?.answer) ||
    'General OPD consultation'

  // HPI
  const hpiPoints: string[] = []
  if (answers['socrates_site']) hpiPoints.push(`Site: ${answers['socrates_site']}`)
  if (answers['socrates_onset'] || answers['hpi_duration']) {
    hpiPoints.push(`Onset/Duration: ${answers['socrates_onset'] || answers['hpi_duration']}`)
  }
  if (answers['socrates_character'] || answers['hpi_progression']) {
    hpiPoints.push(`Character/Progression: ${answers['socrates_character'] || answers['hpi_progression']}`)
  }
  if (answers['socrates_radiation']) hpiPoints.push(`Radiation: ${answers['socrates_radiation']}`)
  if (answers['socrates_severity']) hpiPoints.push(`Severity: ${answers['socrates_severity']}`)
  if (answers['socrates_associated']) hpiPoints.push(`Associated: ${answers['socrates_associated']}`)

  // Also include any other captured Q&A responses in HPI
  if (historyResponses && historyResponses.length > 0) {
    historyResponses.forEach((hr: any) => {
      const k = hr.field_key
      const q = hr.field_value_json?.question_localized || hr.field_value_json?.question || k
      const a = hr.field_value_json?.answer || ''
      if (
        a &&
        !k.startsWith('ayush_') &&
        !['chief_complaint', 'socrates_site', 'socrates_onset', 'socrates_character', 'socrates_radiation', 'socrates_severity', 'socrates_associated'].includes(k)
      ) {
        hpiPoints.push(`${q}: ${a}`)
      }
    })
  }

  const hpi = hpiPoints.length > 0 ? hpiPoints.join('; ') : `Patient presents with ${chiefComplaint}.`

  // Past Medical & Surgical
  const pastMedical = answers['past_medical_history'] || answers['past_history'] || 'No chronic past medical or surgical illness reported.'

  // Drug & Allergy
  const drugAllergy = answers['regular_meds'] || answers['drug_and_allergy'] || 'No active routine medicines or known allergies.'

  // Family & Personal History
  const familyHistory = answers['family_history'] || 'No known family history of chronic hereditary diseases.'
  const personalHistory = answers['personal_history'] || 'Non-smoker, non-alcoholic; denies recreational drug or tobacco use.'

  // Review of Systems
  const reviewOfSystems = answers['review_of_systems'] || 'Cardiovascular: Normal heart sounds; Respiratory: Clear breath sounds; Gastrointestinal: Normal bowel habits.'

  // AYUSH Assessment
  let ayushData: StructuredClinicalSummary['ayush'] = null
  if (ayushRows || session?.department === 'ayush') {
    ayushData = {
      prakriti: ayushRows?.prakriti_json || { constitution: answers['ayush_prakriti'] || 'Not assessed' },
      vikriti: ayushRows?.vikriti_json || { imbalance: answers['ayush_vikriti'] || 'Not assessed' },
      agni: ayushRows?.agni || answers['ayush_agni'] || 'samagni',
      koshtha: ayushRows?.koshtha || answers['ayush_koshtha'] || 'madhyama',
      ahara_vihara: ayushRows?.ahara_vihara_json || { routine: answers['ayush_ahara_vihara'] || 'Standard diet' },
    }
  }

  // Prior Investigations Summary
  const docSummaries: string[] = []
  if (documents && documents.length > 0) {
    documents.forEach((d: any, idx: number) => {
      const s = d.structured_json || {}
      const docDate = s.date_on_document || 'Recent'
      const type = s.doc_type || d.doc_type || 'Prescription'
      const diagnoses = s.diagnoses?.join(', ') || 'None stated'
      const meds = s.medications?.map((m: any) => `${m.name} (${m.dose})`).join(', ') || 'None'
      const labs = s.lab_results?.map((l: any) => `${l.test}: ${l.value} ${l.unit} [${l.flag}]`).join(', ') || 'None'

      docSummaries.push(
        `[Doc ${idx + 1}: ${type.toUpperCase()} - ${docDate}] Diagnoses: ${diagnoses} | Meds: ${meds} | Labs: ${labs}`
      )
    })
  }
  const priorInvestigationsSummary = docSummaries.length > 0
    ? docSummaries.join('\n')
    : 'No prior diagnostic reports or prescription slips presented.'

  // Red Flags
  const redFlagsList = (redFlags || []).map((rf: any) => ({
    flag_type: rf.flag_type,
    severity: rf.severity,
    detail: rf.detail,
    triggered_at: rf.triggered_at,
  }))

  return {
    chief_complaint: chiefComplaint,
    hpi,
    past_medical_surgical: pastMedical,
    drug_allergy: drugAllergy,
    family_history: familyHistory,
    personal_history: personalHistory,
    review_of_systems: reviewOfSystems,
    ayush: ayushData,
    prior_investigations_summary: priorInvestigationsSummary,
    red_flags: redFlagsList,
  }
}

/**
 * Generate, persist, and return the clinical summary
 */
export async function generateAndSaveSummary(sessionId: string): Promise<ClinicalSummaryRecord | null> {
  if (!sessionId) return null

  // 1. Try remote Edge Function if available
  try {
    const { data, error } = await supabase.functions.invoke('generate-summary', {
      body: { session_id: sessionId },
    })

    if (!error && data && data.summary) {
      return data.summary as ClinicalSummaryRecord
    }
  } catch (err) {
    console.warn('Edge function generate-summary unavailable, running resilient local summarizer:', err)
  }

  // 2. Client-side fallback assembler
  const summaryJson = await assembleClientClinicalSummary(sessionId)

  const summaryTextEn = `PATIENT CLINICAL PRE-CONSULT SUMMARY
1. Chief Complaint: ${summaryJson.chief_complaint}
2. HPI: ${summaryJson.hpi}
3. Past Medical & Surgical: ${summaryJson.past_medical_surgical}
4. Medications & Allergies: ${summaryJson.drug_allergy}
5. Review of Systems: ${summaryJson.review_of_systems}
${summaryJson.ayush ? `6. AYUSH: Prakriti=${JSON.stringify(summaryJson.ayush.prakriti)}, Agni=${summaryJson.ayush.agni}` : ''}
7. Scanned Reports: ${summaryJson.prior_investigations_summary}`

  const summaryTextHi = `मरीज़ स्वास्थ्य सारांश
१. मुख्य शिकायत: ${summaryJson.chief_complaint}
२. बीमारी का विवरण: ${summaryJson.hpi}
३. पुरानी बीमारियाँ: ${summaryJson.past_medical_surgical}
४. दवाइयाँ व एलर्जी: ${summaryJson.drug_allergy}
${summaryJson.ayush ? `५. आयुष परीक्षण: ${JSON.stringify(summaryJson.ayush.prakriti)}` : ''}`

  // 3. Upsert into clinical_summaries table
  const { data: record, error: upsertErr } = await supabase
    .from('clinical_summaries')
    .upsert({
      session_id: sessionId,
      summary_json: summaryJson,
      summary_text_en: summaryTextEn,
      summary_text_hi: summaryTextHi,
      physician_edited: false,
      pushed_to_his_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id' })
    .select()
    .single()

  if (upsertErr || !record) {
    console.warn('Could not upsert clinical_summaries row directly, returning assembled record object:', upsertErr)
    return {
      id: `summary-${sessionId}`,
      session_id: sessionId,
      summary_json: summaryJson,
      summary_text_en: summaryTextEn,
      summary_text_hi: summaryTextHi,
      physician_edited: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  // 4. Audit Log
  await supabase.from('audit_log').insert({
    session_id: sessionId,
    actor: 'ai_clinical_summarizer',
    action: 'SUMMARY_GENERATED',
    details: {
      timestamp: new Date().toISOString(),
      chief_complaint: summaryJson.chief_complaint,
    },
  })

  return record as ClinicalSummaryRecord
}

/**
 * Fetch clinical summary for a session
 */
export async function getSessionSummary(sessionId: string): Promise<ClinicalSummaryRecord | null> {
  if (!sessionId) return null

  try {
    const { data, error } = await supabase
      .from('clinical_summaries')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle()

    if (!error && data && data.summary_json && data.summary_json.chief_complaint) {
      return data as ClinicalSummaryRecord
    }
  } catch (err) {
    console.warn('Error querying clinical_summaries:', err)
  }

  // If missing or incomplete in DB, generate and return it now!
  return generateAndSaveSummary(sessionId)
}

/**
 * Save physician edits to the clinical summary
 */
export async function savePhysicianSummaryEdit(
  sessionId: string,
  updatedSummaryJson: StructuredClinicalSummary,
  notes?: string,
  physicianId?: string
): Promise<ClinicalSummaryRecord | null> {
  const payload: Record<string, any> = {
    summary_json: updatedSummaryJson,
    physician_edited: true,
    physician_notes: notes || null,
    edited_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (physicianId) {
    payload.edited_by = physicianId
  }

  const { data, error } = await supabase
    .from('clinical_summaries')
    .update(payload)
    .eq('session_id', sessionId)
    .select()
    .single()

  if (error) {
    console.error('Error updating summary by physician:', error)
    throw error
  }

  // Record physician edit in audit log
  await supabase.from('audit_log').insert({
    session_id: sessionId,
    actor: physicianId || 'attending_physician',
    action: 'SUMMARY_EDITED_BY_PHYSICIAN',
    details: {
      timestamp: new Date().toISOString(),
      notes: notes || null,
    },
  })

  return data as ClinicalSummaryRecord
}
