// Gemini AI Client Service for MediKiosk
// Powers dynamic clinical history interviews, prescription OCR vision, and EHR clinical summaries.
// Model: gemini-3.6-flash / gemini-3.5-flash-lite

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''
const PRIMARY_MODEL = 'gemini-3.6-flash'
const FALLBACK_MODEL = 'gemini-3.5-flash-lite'

export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY && GEMINI_API_KEY.length > 10
}

/**
 * Low-level call to Gemini API with model fallback
 */
async function callGeminiApi(
  payload: any,
  modelName: string = PRIMARY_MODEL
): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error('GEMINI_API_KEY is not configured in .env')
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      // If primary model returns 404/not available, try fallback model
      if ((res.status === 404 || res.status === 503) && modelName !== FALLBACK_MODEL) {
        console.warn(`Gemini model ${modelName} unavailable, falling back to ${FALLBACK_MODEL}...`)
        return callGeminiApi(payload, FALLBACK_MODEL)
      }
      throw new Error(`Gemini API HTTP ${res.status}: ${errText}`)
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      throw new Error('Gemini returned an empty response')
    }
    return text
  } catch (err: any) {
    if (modelName !== FALLBACK_MODEL) {
      console.warn(`Error calling ${modelName}, trying fallback ${FALLBACK_MODEL}:`, err.message)
      return callGeminiApi(payload, FALLBACK_MODEL)
    }
    throw err
  }
}

function getLanguageName(code: string): string {
  const map: Record<string, string> = {
    hi: 'Hindi',
    en: 'English',
    mr: 'Marathi',
    ta: 'Tamil',
    bn: 'Bengali',
    te: 'Telugu',
  }
  return map[code] || code
}

/**
 * 1. Clinical History Interview: Next Question & Red Flag Analysis via Gemini
 */
export async function generateGeminiInterviewTurn(params: {
  history: Array<{ field_key: string; question: string; answer: string }>
  language: string
  department: string
}): Promise<any> {
  const isAyush = params.department === 'ayush' || params.department.includes('ayush')
  const turnCount = params.history.length
  const langName = getLanguageName(params.language)

  const historyContext = params.history.length === 0
    ? 'Patient has just started the consultation. No questions answered yet.'
    : params.history.map((h, i) => `Q${i + 1} (${h.field_key}): "${h.question}" -> Patient Answer: "${h.answer}"`).join('\n')

  const prompt = `You are MediKiosk AI, an empathetic clinical history-taking assistant deployed on an OPD kiosk in India.
Review this patient's history so far and generate the next logical question following clinical guidelines:

${isAyush ? `Follow AYUSH / Ayurveda framework: Chief Complaint -> Prakriti -> Vikriti -> Agni -> Koshtha -> Ahara-Vihara.` : `Follow SOCRATES for pain complaints, or standard HPI -> Past History -> Meds/Allergy -> Family -> Personal History.`}

## Red Flag Check:
If patient reported severe chest pain + breathlessness/sweating, sudden thunderclap headache, stroke symptoms (facial droop/paralysis), or vomiting blood, set red_flag=true with severity "critical" or "high".

## History So Far (${turnCount} turns):
${historyContext}

## Language Requirement:
The patient's language is ${langName}. You MUST write "question_localized" and all "options[].label_localized" in ${langName} script. Do NOT default to English or Hindi unless English is chosen.

## Output Format:
Respond ONLY with a valid JSON object:
{
  "question": "English question text",
  "question_localized": "Localized question in ${langName} script",
  "field_key": "socrates_site or relevant_key",
  "options": [
    {"label": "English option 1", "value": "opt_1", "label_localized": "Localized option 1 in ${langName} with emoji"},
    {"label": "English option 2", "value": "opt_2", "label_localized": "Localized option 2 in ${langName} with emoji"}
  ],
  "allow_free_voice": true,
  "progress": {"current": ${turnCount + 1}, "total": ${isAyush ? 6 : 8}},
  "is_complete": false,
  "red_flag": false,
  "red_flag_reason": null,
  "severity": null
}`

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  const rawJson = await callGeminiApi(payload)
  // Clean markdown backticks if any
  const cleaned = rawJson.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}

/**
 * 2. Prescription & Lab Report OCR via Gemini Vision
 */
export async function digitizeDocumentWithGemini(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<any> {
  const prompt = `You are a clinical OCR system for Indian hospital OPDs.
Analyze this medical document image (prescription slip or laboratory test report).
Extract all clinical information into strict JSON:
{
  "doc_type": "prescription" or "lab_report",
  "date_on_document": "YYYY-MM-DD" or "Recent",
  "hospital_name": "Name of hospital or clinic if found",
  "diagnoses": ["Diagnosis 1", "Diagnosis 2"],
  "medications": [
    {"name": "Drug Name", "dose": "500mg", "frequency": "1-0-1 after meals"}
  ],
  "lab_results": [
    {"test": "Test Name (e.g. HbA1c)", "value": "7.2", "unit": "%", "reference_range": "< 5.7", "flag": "high"}
  ],
  "doctor_notes": "Summary of doctor advice or instructions"
}`

  const cleanBase64 = base64Image.replace(/^data:[^;]+;base64,/, '')

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  }

  const rawJson = await callGeminiApi(payload)
  const cleaned = rawJson.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}

/**
 * 3. EHR Clinical Summary Generation via Gemini
 */
export async function generateClinicalSummaryWithGemini(sessionData: {
  patient: any
  historyResponses: any[]
  redFlags: any[]
  documents: any[]
}): Promise<any> {
  const prompt = `You are an expert physician clinical assistant preparing an Electronic Health Record (EHR) pre-consultation summary.
Convert this OPD kiosk patient data into a structured clinical summary.

Patient: ${JSON.stringify(sessionData.patient || {})}
History Q&A: ${JSON.stringify(sessionData.historyResponses || [])}
Red Flags: ${JSON.stringify(sessionData.redFlags || [])}
Past Documents: ${JSON.stringify(sessionData.documents || [])}

Return strict JSON:
{
  "chief_complaint": "Clear concise chief complaint with duration",
  "hpi": "Structured History of Present Illness following SOCRATES",
  "past_medical_surgical": "Chronic conditions, surgeries, hospitalizations",
  "drug_allergy": "Current regular medications and known allergies",
  "family_history": "Family history of relevant illnesses",
  "personal_history": "Diet, habits, lifestyle",
  "review_of_systems": "Pertinent positive and negative review of systems",
  "ayush": null,
  "prior_investigations_summary": "Summary of past lab reports and prescription slips",
  "red_flags": []
}`

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  const rawJson = await callGeminiApi(payload)
  const cleaned = rawJson.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}
