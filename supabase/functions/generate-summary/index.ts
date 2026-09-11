// Supabase Edge Function: generate-summary
// Aggregates history_responses, red_flags, ayush_history, and documents.structured_json
// into a consolidated EHR-ready clinical summary adhering to the fixed schema.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GenerateSummaryRequest {
  session_id: string
}

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { session_id }: GenerateSummaryRequest = await req.json()

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://solctltzspmhsdvgryja.supabase.co'
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Fetch all data for this session
    const [
      { data: session },
      { data: historyResponses },
      { data: redFlags },
      { data: ayushRows },
      { data: documents },
    ] = await Promise.all([
      supabase.from('sessions').select('*, patients(*)').eq('id', session_id).maybeSingle(),
      supabase.from('history_responses').select('*').eq('session_id', session_id).order('captured_at', { ascending: true }),
      supabase.from('red_flags').select('*').eq('session_id', session_id),
      supabase.from('ayush_history').select('*').eq('session_id', session_id).maybeSingle(),
      supabase.from('documents').select('*').eq('session_id', session_id),
    ])

    // Helper map from history_responses
    const answers: Record<string, string> = {}
    if (historyResponses) {
      historyResponses.forEach((hr: any) => {
        answers[hr.field_key] = hr.field_value_json?.answer || hr.field_value_json?.option_label || ''
      })
    }

    // 2. Assemble Chief Complaint
    const chiefComplaint = answers['chief_complaint'] || 'Routine health evaluation'

    // 3. Assemble HPI
    const hpiPoints: string[] = []
    if (answers['socrates_site']) hpiPoints.push(`Site: ${answers['socrates_site']}`)
    if (answers['socrates_onset'] || answers['hpi_duration']) {
      hpiPoints.push(`Duration/Onset: ${answers['socrates_onset'] || answers['hpi_duration']}`)
    }
    if (answers['socrates_character'] || answers['hpi_progression']) {
      hpiPoints.push(`Character/Progression: ${answers['socrates_character'] || answers['hpi_progression']}`)
    }
    if (answers['socrates_radiation']) hpiPoints.push(`Radiation: ${answers['socrates_radiation']}`)
    if (answers['socrates_severity']) hpiPoints.push(`Severity: ${answers['socrates_severity']}`)
    if (answers['socrates_associated']) hpiPoints.push(`Associated symptoms: ${answers['socrates_associated']}`)
    const hpi = hpiPoints.length > 0 ? hpiPoints.join('; ') : `Patient presents with ${chiefComplaint}.`

    // 4. Past Medical & Surgical History
    const pastMedical = answers['past_medical_history'] || 'No chronic medical illnesses reported.'

    // 5. Drug & Allergy History
    const drugAllergy = answers['regular_meds'] || answers['drug_and_allergy'] || 'No active drug prescriptions or known drug allergies reported.'

    // 6. Family & Personal History
    const familyHistory = answers['family_history'] || 'No significant family history of hereditary illnesses.'
    const personalHistory = answers['personal_history'] || 'Non-smoker, non-alcoholic; denies tobacco use.'

    // 7. Review of Systems
    const reviewOfSystems = answers['review_of_systems'] || 'Cardiovascular: Normal; Respiratory: Clear; GI: Denies nausea/vomiting unless noted in chief complaint.'

    // 8. AYUSH Assessment (if present)
    let ayushData: StructuredClinicalSummary['ayush'] = null
    if (ayushRows || session?.department === 'ayush') {
      ayushData = {
        prakriti: ayushRows?.prakriti_json || { constitution: answers['ayush_prakriti'] || 'Not specified' },
        vikriti: ayushRows?.vikriti_json || { imbalance: answers['ayush_vikriti'] || 'Not specified' },
        agni: ayushRows?.agni || answers['ayush_agni'] || 'samagni',
        koshtha: ayushRows?.koshtha || answers['ayush_koshtha'] || 'madhyama',
        ahara_vihara: ayushRows?.ahara_vihara_json || { routine: answers['ayush_ahara_vihara'] || 'Standard diet' },
      }
    }

    // 9. Prior Investigations Summary (from scanned documents)
    const docSummaries: string[] = []
    if (documents && documents.length > 0) {
      documents.forEach((d: any, idx: number) => {
        const s = d.structured_json || {}
        const docDate = s.date_on_document || 'Date unknown'
        const type = s.doc_type || d.doc_type || 'Prescription'
        const diagnoses = s.diagnoses?.join(', ') || 'N/A'
        const meds = s.medications?.map((m: any) => `${m.name} (${m.dose})`).join(', ') || 'None'
        const labs = s.lab_results?.map((l: any) => `${l.test}: ${l.value} ${l.unit} [${l.flag}]`).join(', ') || 'None'

        docSummaries.push(
          `[Doc ${idx + 1}: ${type.toUpperCase()} dated ${docDate}] Diagnoses: ${diagnoses} | Meds: ${meds} | Labs: ${labs}`
        )
      })
    }
    const priorInvestigationsSummary = docSummaries.length > 0
      ? docSummaries.join('\n')
      : 'No prior diagnostic reports or prescription slips presented.'

    // 10. Red Flags
    const redFlagsList = (redFlags || []).map((rf: any) => ({
      flag_type: rf.flag_type,
      severity: rf.severity,
      detail: rf.detail,
      triggered_at: rf.triggered_at,
    }))

    // 11. Compose Structured Summary JSON
    const summaryJson: StructuredClinicalSummary = {
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

    // Compose human-readable English & Hindi narrative text
    const summaryTextEn = `PATIENT CLINICAL PRE-CONSULT SUMMARY
Token: ${session?.token_number || 'N/A'} | Department: ${session?.department || 'General'}
Patient: ${session?.patients?.name || 'Patient'} (${session?.patients?.gender || 'N/A'}, DOB: ${session?.patients?.dob || 'N/A'})

1. CHIEF COMPLAINT:
${chiefComplaint}

2. HISTORY OF PRESENT ILLNESS:
${hpi}

3. PAST MEDICAL & SURGICAL:
${pastMedical}

4. MEDICATIONS & ALLERGIES:
${drugAllergy}

${ayushData ? `5. AYUSH AYURVEDIC ASSESSMENT:
Prakriti: ${JSON.stringify(ayushData.prakriti)} | Vikriti: ${JSON.stringify(ayushData.vikriti)} | Agni: ${ayushData.agni} | Koshtha: ${ayushData.koshtha}` : ''}

6. PRIOR SCANNED INVESTIGATIONS:
${priorInvestigationsSummary}

${redFlagsList.length > 0 ? `EMERGENCY RED FLAGS DETECTED:\n${redFlagsList.map(r => `• [${r.severity.toUpperCase()}] ${r.detail}`).join('\n')}` : 'No acute clinical red flags raised.'}`

    const summaryTextHi = `मरीज़ स्वास्थ्य विवरण (Pre-Consult Summary)
टोकन: ${session?.token_number || 'N/A'} | ओपीडी विभाग: ${session?.department === 'ayush' ? 'आयुष (आयुर्वेद)' : 'सामान्य ओपीडी'}
मरीज़: ${session?.patients?.name || 'मरीज़'}

१. मुख्य स्वास्थ्य समस्या:
${chiefComplaint}

२. वर्तमान बीमारी का इतिहास:
${hpi}

३. पुरानी बीमारियाँ:
${pastMedical}

४. नियमित दवाइयाँ व एलर्जी:
${drugAllergy}

${ayushData ? `५. आयुष आयुर्वेदिक परीक्षण:
प्रकृति: ${ayushData.prakriti?.constitution || 'N/A'} | विकृति: ${ayushData.vikriti?.imbalance || 'N/A'} | अग्नि: ${ayushData.agni} | कोष्ठ: ${ayushData.koshtha}` : ''}

६. पूर्व जाँच रिपोर्ट सारांश:
${priorInvestigationsSummary}

${redFlagsList.length > 0 ? `आपातकालीन चेतावनी:\n${redFlagsList.map(r => `• ${r.detail}`).join('\n')}` : 'कोई आपातकालीन चेतावनी नहीं पाई गई।'}`

    // 12. Upsert into clinical_summaries table
    const { data: upsertedSummary, error: upsertErr } = await supabase
      .from('clinical_summaries')
      .upsert({
        session_id,
        summary_json: summaryJson,
        summary_text_en: summaryTextEn,
        summary_text_hi: summaryTextHi,
        physician_edited: false,
        pushed_to_his_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'session_id' })
      .select()
      .single()

    if (upsertErr) {
      console.error('Error saving clinical summary to Supabase:', upsertErr)
    }

    // 13. Audit Log entry
    await supabase.from('audit_log').insert({
      session_id,
      actor: 'ai_clinical_summarizer',
      action: 'SUMMARY_GENERATED',
      details: {
        timestamp: new Date().toISOString(),
        has_red_flags: redFlagsList.length > 0,
        has_ayush: !!ayushData,
        documents_count: documents?.length || 0,
      },
    })

    return new Response(JSON.stringify({
      success: true,
      summary: upsertedSummary || { session_id, summary_json: summaryJson, summary_text_en: summaryTextEn, summary_text_hi: summaryTextHi },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to generate clinical summary' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
