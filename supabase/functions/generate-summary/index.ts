// Supabase Edge Function: generate-summary
// Aggregates history_responses, red_flags, ayush_history, and documents.structured_json
// into a consolidated EHR-ready clinical summary.
// Uses Gemini 2.5 Flash to synthesize physician-readable prose and real Hindi translation.
// Falls back to deterministic assembly if API is unavailable.

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

// ═══════════════════════════════════════════════════════════════════════════
// Gemini 2.5 Flash — Clinical Summary Synthesis
// ═══════════════════════════════════════════════════════════════════════════

const SUMMARY_SYSTEM_PROMPT = `You are a senior house officer at an Indian hospital, preparing a pre-consultation clinical summary for the attending physician.

## YOUR TASK
Given raw clinical data from a patient kiosk (interview responses, scanned document extractions, red flags, and AYUSH assessments), synthesize a clear, concise, physician-readable clinical summary.

## WRITING STYLE
- Write as if presenting a case during morning rounds.
- Use standard medical abbreviations (DM, HTN, URTI, LRTI, GERD, OA, etc.).
- Be concise but clinically complete — no padding or filler text.
- Organize information per section; don't repeat data across sections.
- For the HPI, write a flowing narrative paragraph (not bullet points).
- Flag any clinically significant findings explicitly.

## OUTPUT FORMAT
You must return a JSON object with these exact fields:
1. "chief_complaint": One-line chief complaint
2. "hpi": History of present illness as a narrative paragraph
3. "past_medical_surgical": Past medical and surgical history
4. "drug_allergy": Current medications and known allergies
5. "family_history": Family history of hereditary conditions
6. "personal_history": Smoking, alcohol, tobacco, diet, exercise habits
7. "review_of_systems": Brief review of relevant systems (CVS, RS, GI, CNS)
8. "ayush": AYUSH/Ayurvedic assessment object (null if not applicable) with prakriti, vikriti, agni, koshtha, ahara_vihara
9. "prior_investigations_summary": Summary of any scanned lab reports or prescriptions
10. "red_flags": Array of emergency flags (keep as-is from input data)
11. "summary_text_en": Complete English clinical summary in professional medical prose (multi-paragraph, section-headed)
12. "summary_text_hi": Complete Hindi clinical summary (NOT a word-for-word translation — rewrite as natural Hindi medical prose that an Indian doctor reading Devanagari would find professional and clear, using standard Hindi medical terminology)`

const SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    chief_complaint: { type: 'STRING' },
    hpi: { type: 'STRING' },
    past_medical_surgical: { type: 'STRING' },
    drug_allergy: { type: 'STRING' },
    family_history: { type: 'STRING' },
    personal_history: { type: 'STRING' },
    review_of_systems: { type: 'STRING' },
    ayush: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        prakriti: { type: 'STRING' },
        vikriti: { type: 'STRING' },
        agni: { type: 'STRING', nullable: true },
        koshtha: { type: 'STRING', nullable: true },
        ahara_vihara: { type: 'STRING' },
      },
    },
    prior_investigations_summary: { type: 'STRING' },
    red_flags: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          flag_type: { type: 'STRING' },
          severity: { type: 'STRING' },
          detail: { type: 'STRING' },
          triggered_at: { type: 'STRING' },
        },
      },
    },
    summary_text_en: { type: 'STRING' },
    summary_text_hi: { type: 'STRING' },
  },
  required: [
    'chief_complaint', 'hpi', 'past_medical_surgical', 'drug_allergy',
    'family_history', 'personal_history', 'review_of_systems',
    'prior_investigations_summary', 'red_flags',
    'summary_text_en', 'summary_text_hi',
  ],
}

async function synthesizeWithGemini(
  apiKey: string,
  rawData: Record<string, any>
): Promise<{ summaryJson: StructuredClinicalSummary; summaryTextEn: string; summaryTextHi: string } | null> {
  const userContent = `Here is the raw clinical data from the patient kiosk session. Synthesize a professional clinical summary.\n\n${JSON.stringify(rawData, null, 2)}`

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userContent }],
      },
    ],
    systemInstruction: {
      parts: [{ text: SUMMARY_SYSTEM_PROMPT }],
    },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: SUMMARY_RESPONSE_SCHEMA,
    },
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error(`Gemini Summary API error (${res.status}):`, errText)
    return null
  }

  const data = await res.json()
  const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!textContent) {
    console.error('Gemini returned no text content for summary:', JSON.stringify(data))
    return null
  }

  const parsed = JSON.parse(textContent)

  const summaryJson: StructuredClinicalSummary = {
    chief_complaint: parsed.chief_complaint || '',
    hpi: parsed.hpi || '',
    past_medical_surgical: parsed.past_medical_surgical || '',
    drug_allergy: parsed.drug_allergy || '',
    family_history: parsed.family_history || '',
    personal_history: parsed.personal_history || '',
    review_of_systems: parsed.review_of_systems || '',
    ayush: parsed.ayush || null,
    prior_investigations_summary: parsed.prior_investigations_summary || '',
    red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
  }

  return {
    summaryJson,
    summaryTextEn: parsed.summary_text_en || '',
    summaryTextHi: parsed.summary_text_hi || '',
  }
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

    // Red Flags (pass through unchanged)
    const redFlagsList = (redFlags || []).map((rf: any) => ({
      flag_type: rf.flag_type,
      severity: rf.severity,
      detail: rf.detail,
      triggered_at: rf.triggered_at,
    }))

    // Prepare raw data bundle for LLM
    const rawClinicalData = {
      patient: {
        name: session?.patients?.name || 'Patient',
        gender: session?.patients?.gender || 'N/A',
        dob: session?.patients?.dob || 'N/A',
        token_number: session?.token_number || 'N/A',
        department: session?.department || 'General Medicine',
      },
      interview_responses: answers,
      red_flags: redFlagsList,
      ayush_assessment: ayushRows ? {
        prakriti: ayushRows.prakriti_json || answers['ayush_prakriti'] || null,
        vikriti: ayushRows.vikriti_json || answers['ayush_vikriti'] || null,
        agni: ayushRows.agni || answers['ayush_agni'] || null,
        koshtha: ayushRows.koshtha || answers['ayush_koshtha'] || null,
        ahara_vihara: ayushRows.ahara_vihara_json || answers['ayush_ahara_vihara'] || null,
      } : (session?.department === 'ayush' ? {
        prakriti: answers['ayush_prakriti'] || null,
        vikriti: answers['ayush_vikriti'] || null,
        agni: answers['ayush_agni'] || null,
        koshtha: answers['ayush_koshtha'] || null,
        ahara_vihara: answers['ayush_ahara_vihara'] || null,
      } : null),
      scanned_documents: (documents || []).map((d: any) => ({
        doc_type: d.structured_json?.doc_type || d.doc_type || 'unknown',
        date: d.structured_json?.date_on_document || 'Unknown',
        diagnoses: d.structured_json?.diagnoses || [],
        medications: d.structured_json?.medications || [],
        lab_results: d.structured_json?.lab_results || [],
        doctor_notes: d.structured_json?.doctor_notes || '',
        hospital_name: d.structured_json?.hospital_name || '',
      })),
    }

    let summaryJson: StructuredClinicalSummary
    let summaryTextEn: string
    let summaryTextHi: string

    // Try Gemini LLM synthesis first
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    let usedLlm = false

    if (geminiKey) {
      try {
        const llmResult = await synthesizeWithGemini(geminiKey, rawClinicalData)
        if (llmResult) {
          summaryJson = llmResult.summaryJson
          // Preserve the original red_flags array (LLM shouldn't modify these)
          summaryJson.red_flags = redFlagsList
          summaryTextEn = llmResult.summaryTextEn
          summaryTextHi = llmResult.summaryTextHi
          usedLlm = true
          console.log('Gemini summary synthesis successful')
        }
      } catch (err) {
        console.warn('Gemini summary synthesis failed, falling back to deterministic:', err)
      }
    }

    // Fallback: Deterministic assembly (original logic)
    if (!usedLlm) {
      const chiefComplaint = answers['chief_complaint'] || 'Routine health evaluation'

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

      const pastMedical = answers['past_medical_history'] || 'No chronic medical illnesses reported.'
      const drugAllergy = answers['regular_meds'] || answers['drug_and_allergy'] || 'No active drug prescriptions or known drug allergies reported.'
      const familyHistory = answers['family_history'] || 'No significant family history of hereditary illnesses.'
      const personalHistory = answers['personal_history'] || 'Non-smoker, non-alcoholic; denies tobacco use.'
      const reviewOfSystems = answers['review_of_systems'] || 'Cardiovascular: Normal; Respiratory: Clear; GI: Denies nausea/vomiting unless noted in chief complaint.'

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

      summaryJson = {
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

      summaryTextEn = `PATIENT CLINICAL PRE-CONSULT SUMMARY
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

      summaryTextHi = `मरीज़ स्वास्थ्य विवरण (Pre-Consult Summary)
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
    }

    // Upsert into clinical_summaries table
    const { data: upsertedSummary, error: upsertErr } = await supabase
      .from('clinical_summaries')
      .upsert({
        session_id,
        summary_json: summaryJson!,
        summary_text_en: summaryTextEn!,
        summary_text_hi: summaryTextHi!,
        physician_edited: false,
        pushed_to_his_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'session_id' })
      .select()
      .single()

    if (upsertErr) {
      console.error('Error saving clinical summary to Supabase:', upsertErr)
    }

    // Audit Log entry
    await supabase.from('audit_log').insert({
      session_id,
      actor: usedLlm ? 'ai_gemini_summarizer' : 'ai_clinical_summarizer',
      action: 'SUMMARY_GENERATED',
      details: {
        timestamp: new Date().toISOString(),
        has_red_flags: redFlagsList.length > 0,
        has_ayush: !!rawClinicalData.ayush_assessment,
        documents_count: documents?.length || 0,
        used_llm: usedLlm,
      },
    })

    return new Response(JSON.stringify({
      success: true,
      summary: upsertedSummary || { session_id, summary_json: summaryJson!, summary_text_en: summaryTextEn!, summary_text_hi: summaryTextHi! },
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
