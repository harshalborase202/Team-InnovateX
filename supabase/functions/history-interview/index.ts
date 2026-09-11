// Supabase Edge Function: history-interview
// Clinical history-taking interview engine adhering to SOCRATES and general HPI frameworks.
// Designed with a swappable LLM provider architecture (OpenAI/Gemini/Anthropic) with
// intelligent clinical fallback logic.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ConversationTurn {
  field_key: string
  question: string
  answer: string
  source?: 'voice' | 'touch'
}

interface InterviewRequest {
  session_id: string
  history: ConversationTurn[]
  language?: string // 'hi' | 'en' | 'mr' | 'ta' | 'bn' | 'te'
  department?: string
  patient_info?: {
    name?: string
    age?: number | string
    gender?: string
  }
}

interface InterviewResponse {
  question: string
  question_localized: string
  field_key: string
  options: { label: string; value: string; label_localized: string }[]
  allow_free_voice: boolean
  progress: {
    current: number
    total: number
  }
  is_complete: boolean
  red_flag: boolean
  red_flag_reason: string | null
  severity: 'critical' | 'high' | 'medium' | null
}

// Check for emergency red flags in running patient responses
function evaluateRedFlags(history: ConversationTurn[]): { red_flag: boolean; reason: string | null; severity: 'critical' | 'high' | 'medium' | null } {
  const fullText = history.map((h) => `${h.field_key}: ${h.answer}`).join(' ').toLowerCase()

  // 1. Cardiac / Respiratory Emergencies
  if (
    (fullText.includes('chest') || fullText.includes('सीने') || fullText.includes('छाती')) &&
    (fullText.includes('breath') || fullText.includes('सांस') || fullText.includes('दम') || fullText.includes('sweat') || fullText.includes('पसीना') || fullText.includes('heavy') || fullText.includes('दबाव'))
  ) {
    return {
      red_flag: true,
      reason: 'Potential Acute Coronary Syndrome / Severe Dyspnea (Chest pain with breathing difficulty/sweating)',
      severity: 'critical',
    }
  }

  // 2. Neurological Emergencies (Stroke / Thunderclap headache)
  if (
    (fullText.includes('sudden') || fullText.includes('अचानक')) &&
    (fullText.includes('headache') || fullText.includes('सिर दर्द') || fullText.includes('worst') || fullText.includes('कड़ा'))
  ) {
    return {
      red_flag: true,
      reason: 'Sudden severe headache (Thunderclap onset — potential subarachnoid hemorrhage)',
      severity: 'critical',
    }
  }

  if (
    fullText.includes('paralysis') ||
    fullText.includes('weakness in face') ||
    fullText.includes('speech slurred') ||
    fullText.includes('मुंह टेढ़ा') ||
    fullText.includes('लकवा')
  ) {
    return {
      red_flag: true,
      reason: 'Stroke-like symptoms (Facial weakness, speech difficulty or hemiparesis)',
      severity: 'critical',
    }
  }

  // 3. Severe Bleeding / Hemoptysis / Hematemesis
  if (
    fullText.includes('blood in vomit') ||
    fullText.includes('blood in cough') ||
    fullText.includes('खून की उल्टी') ||
    fullText.includes('खांसी में खून')
  ) {
    return {
      red_flag: true,
      reason: 'Active hemorrhage or hemoptysis',
      severity: 'high',
    }
  }

  return { red_flag: false, reason: null, severity: null }
}

// Swappable LLM Decision Architecture
// If OPENAI_API_KEY or other model key is set in environment, this delegates to the LLM.
// Otherwise, it utilizes the clinical SOCRATES and HPI rule-engine.
async function decideNextQuestion(
  history: ConversationTurn[],
  language: string = 'hi',
  department: string = 'general_medicine'
): Promise<InterviewResponse> {
  // First check red flags on the running answers
  const redFlagCheck = evaluateRedFlags(history)
  if (redFlagCheck.red_flag) {
    return {
      question: 'Immediate clinical alert: Red flag symptoms detected.',
      question_localized: 'आपातकालीन लक्षण पाए गए हैं। कृपया तुरंत स्वास्थ्य कर्मी को सूचित करें।',
      field_key: 'emergency_alert',
      options: [],
      allow_free_voice: false,
      progress: { current: history.length, total: 10 },
      is_complete: false,
      red_flag: true,
      red_flag_reason: redFlagCheck.reason,
      severity: redFlagCheck.severity,
    }
  }

  // If external LLM API key is configured in Supabase Secrets, call it here:
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (openAiKey) {
    try {
      const llmResult = await callLlmModel(openAiKey, history, language)
      if (llmResult) return llmResult
    } catch (err) {
      console.warn('LLM call failed, falling back to clinical engine:', err)
    }
  }

  // Core Deterministic Clinical Reasoning Engine (SOCRATES + HPI + AYUSH)
  return runClinicalDecisionTree(history, language, department)
}

// Placeholder for swappable LLM provider (e.g. OpenAI / Claude / Gemini)
async function callLlmModel(
  apiKey: string,
  history: ConversationTurn[],
  language: string
): Promise<InterviewResponse | null> {
  const systemPrompt = `You are MediKiosk AI Clinical Interviewer for an Indian hospital OPD kiosk.
Follow SOCRATES for pain and standard HPI + PMH + Allergies otherwise.
Generate the next single question in English and translated into ${language}.
Output strictly JSON matching the specified schema with 2-5 short tap options.`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ history, language }) },
      ],
      temperature: 0.2,
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  return parsed as InterviewResponse
}

// Clinical Decision Tree (SOCRATES, General HPI & AYUSH)
function runClinicalDecisionTree(
  history: ConversationTurn[],
  language: string = 'hi',
  department: string = 'general_medicine'
): InterviewResponse {
  const turnCount = history.length
  const isAyush = department === 'ayush' || department.includes('ayush') || department.includes('ayurveda')

  // ═══════════════════════════════════════════════════════════════════
  // AYUSH / AYURVEDIC CLINICAL INTERVIEW BRANCH
  // ═══════════════════════════════════════════════════════════════════
  if (isAyush) {
    const ayushTotal = 6

    if (turnCount >= ayushTotal) {
      return {
        question: 'Thank you. Your AYUSH clinical profile and health history are recorded.',
        question_localized:
          language === 'hi'
            ? 'धन्यवाद। आपकी प्रकृति, अग्नि, कोष्ठ व स्वास्थ्य विवरण सफलतापूर्वक दर्ज कर लिया गया है।'
            : 'Thank you. Your AYUSH clinical profile and health history are recorded.',
        field_key: 'interview_completed',
        options: [
          {
            label: 'Proceed to Report Scanning',
            value: 'proceed',
            label_localized: language === 'hi' ? 'दस्तावेज़ स्कैनिंग के लिए आगे बढ़ें ➔' : 'Proceed to Report Scanning ➔',
          },
        ],
        allow_free_voice: false,
        progress: { current: ayushTotal, total: ayushTotal },
        is_complete: true,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (turnCount === 0) {
      return {
        question: 'What is your primary health complaint today?',
        question_localized:
          language === 'hi'
            ? 'आज आपको क्या मुख्य स्वास्थ्य तकलीफ़ या समस्या है?'
            : 'What is your primary health complaint today?',
        field_key: 'chief_complaint',
        options: [
          { label: 'Indigestion / Gas / Acidity', value: 'digestion', label_localized: '🔥 गैस, बदहजमी या एसिडिटी (Digestion)' },
          { label: 'Joint Pain / Vata Vyadhi', value: 'joint_pain', label_localized: '⚡ जोड़ों या बदन का दर्द (Joint Pain)' },
          { label: 'Cough / Cold / Respiratory', value: 'cough', label_localized: '🗣️ खाँसी, बलगम या दमा (Respiratory)' },
          { label: 'Skin Conditions / Rashes', value: 'skin', label_localized: '🩹 त्वचा रोग / खुजली / दाद (Skin)' },
          { label: 'Weakness / Low Energy', value: 'fatigue', label_localized: '💤 कमज़ोरी या थकान (Fatigue)' },
          { label: 'Other', value: 'other', label_localized: '❓ अन्य समस्या (Other)' },
        ],
        allow_free_voice: true,
        progress: { current: 1, total: ayushTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (!history.find((h) => h.field_key === 'ayush_prakriti')) {
      return {
        question: 'Prakriti (Natural Constitution): What is your natural body build and weather preference?',
        question_localized:
          language === 'hi'
            ? 'प्रकृति (शारीरिक गठन): आपकी स्वाभाविक शारीरिक बनावट और मौसम सहनशीलता कैसी है?'
            : 'Prakriti: What is your natural body build, appetite, and weather tolerance?',
        field_key: 'ayush_prakriti',
        options: [
          {
            label: 'Vata: Lean build, easily feels cold, active/restless mind',
            value: 'vata',
            label_localized: '💨 वात: दुबला शरीर, जल्दी ठंड लगना, चंचल स्वभाव',
          },
          {
            label: 'Pitta: Medium build, feels heat/sweat quickly, sharp appetite',
            value: 'pitta',
            label_localized: '🔥 पित्त: मध्यम शरीर, अधिक गर्मी/पसीना, तेज़ भूख',
          },
          {
            label: 'Kapha: Solid/heavy build, calm nature, sound sleep',
            value: 'kapha',
            label_localized: '💧 कफ: मजबूत/भारी शरीर, शांत स्वभाव, गहरी नींद',
          },
          {
            label: 'Mixed / Balanced: Combination of doshas',
            value: 'mixed',
            label_localized: '⚖️ मिश्रित: मिले-जुले लक्षण (Combination)',
          },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: ayushTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (!history.find((h) => h.field_key === 'ayush_vikriti')) {
      return {
        question: 'Vikriti (Current Imbalance): Which imbalance is troubling you the most right now?',
        question_localized:
          language === 'hi'
            ? 'विकृति (वर्तमान असंतुलन): अभी आपको मुख्य रूप से किस प्रकार की तकलीफ़ महसूस हो रही है?'
            : 'Vikriti: Which doshic imbalance feels most disturbed currently?',
        field_key: 'ayush_vikriti',
        options: [
          {
            label: 'Vata imbalance: Joint aches, gas, constipation, restlessness',
            value: 'vata_imbalance',
            label_localized: '💨 वात असंतुलन: जोड़ों में दर्द, गैस, अनिद्रा या रूखापन',
          },
          {
            label: 'Pitta imbalance: Acidity, burning sensations, skin heat, mouth ulcers',
            value: 'pitta_imbalance',
            label_localized: '🔥 पित्त असंतुलन: एसिडिटी, जलन, मुँह में छाले या गुस्सा',
          },
          {
            label: 'Kapha imbalance: Heaviness in body, excess phlegm, lethargy, weight gain',
            value: 'kapha_imbalance',
            label_localized: '💧 कफ असंतुलन: भारीपन, बलगम, अत्यधिक सुस्ती व कफ',
          },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: ayushTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (!history.find((h) => h.field_key === 'ayush_agni')) {
      return {
        question: 'Agni (Digestive Fire): How is your daily appetite and digestion?',
        question_localized:
          language === 'hi'
            ? 'जठराग्नि (पाचन शक्ति): आपकी भूख और भोजन पचाने की शक्ति कैसी है?'
            : 'Agni: How is your daily appetite and digestive strength?',
        field_key: 'ayush_agni',
        options: [
          {
            label: 'Samagni: Normal appetite, food digests easily on time',
            value: 'samagni',
            label_localized: '🟢 समाग्नि: नियमित भूख, खाना आसानी से पचता है',
          },
          {
            label: 'Tikshnagni: Very intense hunger, burning/acidity if delayed',
            value: 'tikshnagni',
            label_localized: '🔴 तीक्ष्णाग्नि: बहुत तेज़ भूख, न खाने पर एसिडिटी व जलन',
          },
          {
            label: 'Mandagni: Poor appetite, feels heavy/bloated after eating',
            value: 'mandagni',
            label_localized: '🟡 मन्दाग्नि: भूख बहुत कम, खाने के बाद भारीपन व फूला पेट',
          },
          {
            label: 'Vishamagni: Irregular appetite, unpredictable digestion',
            value: 'vishamagni',
            label_localized: '🔵 विषमाग्नि: कभी बहुत भूख, कभी बिल्कुल नहीं',
          },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: ayushTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (!history.find((h) => h.field_key === 'ayush_koshtha')) {
      return {
        question: 'Koshtha (Bowel Nature): How is your bowel movement regularity and stool nature?',
        question_localized:
          language === 'hi'
            ? 'कोष्ठ (पेट साफ होने की प्रकृति): आपका शौच / पेट साफ होने की आदत कैसी है?'
            : 'Koshtha: How is your bowel evacuation nature?',
        field_key: 'ayush_koshtha',
        options: [
          {
            label: 'Mrudu Koshtha: Soft, easy evacuation even with warm milk',
            value: 'mrudu',
            label_localized: '💧 मृदु कोष्ठ: आसानी से/दूध से भी तुरंत पेट साफ होता है',
          },
          {
            label: 'Madhyama Koshtha: Normal, comfortable daily evacuation',
            value: 'madhyama',
            label_localized: '⚖️ मध्यम कोष्ठ: दिन में १-२ बार सामान्य रूप से साफ होता है',
          },
          {
            label: 'Krura Koshtha: Hard, dry stool, tendency towards constipation',
            value: 'krura',
            label_localized: '🪨 क्रूर कोष्ठ: कब्ज रहता है, मल कड़ा होता है, ज़ोर लगाना पड़ता है',
          },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: ayushTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (!history.find((h) => h.field_key === 'ayush_ahara_vihara')) {
      return {
        question: 'Ahara-Vihara (Diet & Routine): What are your daily food and lifestyle habits?',
        question_localized:
          language === 'hi'
            ? 'आहार-विहार (दिनचर्या): आपकी दैनिक खानपान और सोने-जागने की मुख्य आदत कैसी है?'
            : 'Ahara-Vihara: What describes your daily diet and lifestyle habits?',
        field_key: 'ayush_ahara_vihara',
        options: [
          {
            label: 'Satvik / Light home food, regular sleep routine',
            value: 'satvik_regular',
            label_localized: '🥗 सादा घर का भोजन, समय पर सोना और जागना',
          },
          {
            label: 'Spicy / oily / heavy food, irregular meal timings',
            value: 'spicy_irregular',
            label_localized: '🌶️ तीखा, तला-भुना या अनियमित समय पर भोजन',
          },
          {
            label: 'Late night sleeping, high stress or sedentary routine',
            value: 'late_nights_stress',
            label_localized: '⏰ देर रात तक जागना, तनाव व शारीरिक श्रम की कमी',
          },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: ayushTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }
  }
  const chiefTurn = history.find((h) => h.field_key === 'chief_complaint')
  const chief = chiefTurn ? chiefTurn.answer.toLowerCase() : ''
  const isPainComplaint =
    chief.includes('pain') ||
    chief.includes('दर्द') ||
    chief.includes('stomach') ||
    chief.includes('body') ||
    chief.includes('सिर') ||
    chief.includes('पेट')

  // Total questions target: ~8 to 10
  const targetTotal = isPainComplaint ? 9 : 8

  // Termination condition: enough information gathered
  if (turnCount >= targetTotal) {
    return {
      question: 'Thank you. We have gathered sufficient health history for the doctor.',
      question_localized:
        language === 'hi'
          ? 'धन्यवाद। डॉक्टर के लिए पर्याप्त स्वास्थ्य जानकारी एकत्र कर ली गई है।'
          : 'Thank you. We have gathered sufficient health history for the doctor.',
      field_key: 'interview_completed',
      options: [
        {
          label: 'Proceed to document scanning',
          value: 'proceed',
          label_localized: language === 'hi' ? 'दस्तावेज़ स्कैनिंग के लिए आगे बढ़ें' : 'Proceed to document scanning',
        },
      ],
      allow_free_voice: false,
      progress: { current: targetTotal, total: targetTotal },
      is_complete: true,
      red_flag: false,
      red_flag_reason: null,
      severity: null,
    }
  }

  // Question 0: Chief Complaint (Initial)
  if (turnCount === 0) {
    return {
      question: 'What is bothering you today?',
      question_localized:
        language === 'hi'
          ? 'आज आपको क्या मुख्य तकलीफ़ या समस्या है?'
          : 'What is bothering you today?',
      field_key: 'chief_complaint',
      options: [
        { label: 'Fever', value: 'fever', label_localized: '🌡️ बुखार (Fever)' },
        { label: 'Cough / Cold', value: 'cough', label_localized: '🗣️ खाँसी / ज़ुकाम (Cough)' },
        { label: 'Stomach Pain', value: 'stomach_pain', label_localized: '🤢 पेट दर्द (Stomach Pain)' },
        { label: 'Body Pain / Joint Pain', value: 'body_pain', label_localized: '⚡ बदन / जोड़ों का दर्द (Body Pain)' },
        { label: "Women's Health", value: 'womens_health', label_localized: "🌸 महिला स्वास्थ्य (Women's Health)" },
        { label: 'Skin Problem', value: 'skin', label_localized: '🩹 त्वचा / दाद-खुजली (Skin)' },
        { label: 'Other', value: 'other', label_localized: '❓ अन्य समस्या (Other)' },
      ],
      allow_free_voice: true,
      progress: { current: 1, total: targetTotal },
      is_complete: false,
      red_flag: false,
      red_flag_reason: null,
      severity: null,
    }
  }

  // ── SOCRATES PATH (for Pain-type complaints) ──────────────────────
  if (isPainComplaint) {
    // 1. Site / Location
    if (!history.find((h) => h.field_key === 'socrates_site')) {
      return {
        question: 'Where exactly is the pain located?',
        question_localized:
          language === 'hi' ? 'दर्द शरीर में ठीक किस जगह पर हो रहा है?' : 'Where exactly is the pain located?',
        field_key: 'socrates_site',
        options: [
          { label: 'Upper abdomen', value: 'upper_abdomen', label_localized: 'पेट के ऊपरी हिस्से में' },
          { label: 'Lower abdomen', value: 'lower_abdomen', label_localized: 'पेट के निचले हिस्से में' },
          { label: 'Head / Forehead', value: 'head', label_localized: 'सिर या माथे में' },
          { label: 'Back / Spine', value: 'back', label_localized: 'कमर या पीठ में' },
          { label: 'Chest', value: 'chest', label_localized: 'सीने में' },
          { label: 'Joints / Legs', value: 'joints', label_localized: 'घुटनों / जोड़ों / पैरों में' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: targetTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    // 2. Onset & Duration
    if (!history.find((h) => h.field_key === 'socrates_onset')) {
      return {
        question: 'When did this pain start, and did it come on suddenly or gradually?',
        question_localized:
          language === 'hi'
            ? 'यह दर्द कब से शुरू हुआ, और क्या यह अचानक आया या धीरे-धीरे बढ़ा?'
            : 'When did this pain start, and did it come on suddenly or gradually?',
        field_key: 'socrates_onset',
        options: [
          { label: 'Today (Sudden)', value: 'today_sudden', label_localized: 'आज ही अचानक शुरू हुआ' },
          { label: '2-3 days ago', value: '2_3_days', label_localized: 'पिछले २-३ दिनों से है' },
          { label: '1-2 weeks ago', value: '1_2_weeks', label_localized: '१-२ हफ्तों से धीरे-धीरे बढ़ रहा है' },
          { label: 'More than a month', value: 'chronic', label_localized: '१ महीने से अधिक पुराना है' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: targetTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    // 3. Character / Quality
    if (!history.find((h) => h.field_key === 'socrates_character')) {
      return {
        question: 'What kind of pain is it?',
        question_localized:
          language === 'hi' ? 'यह दर्द किस प्रकार का महसूस होता है?' : 'What kind of pain is it?',
        field_key: 'socrates_character',
        options: [
          { label: 'Sharp / Stabbing', value: 'sharp', label_localized: 'तीखा या चुभने जैसा' },
          { label: 'Dull ache / Heavy', value: 'dull', label_localized: 'हल्का-हल्का भारी या मीठा दर्द' },
          { label: 'Burning sensation', value: 'burning', label_localized: 'जलन जैसा दर्द' },
          { label: 'Cramping / Colicky', value: 'cramping', label_localized: 'ऐंठन या मरोड़ जैसा' },
          { label: 'Throbbing / Pulsing', value: 'throbbing', label_localized: 'धड़कता हुआ (कसमसाता हुआ)' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: targetTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    // 4. Radiation
    if (!history.find((h) => h.field_key === 'socrates_radiation')) {
      return {
        question: 'Does the pain spread or travel to any other part of the body?',
        question_localized:
          language === 'hi'
            ? 'क्या यह दर्द शरीर के किसी अन्य हिस्से में भी फैलता या जाता है?'
            : 'Does the pain spread or travel to any other part of the body?',
        field_key: 'socrates_radiation',
        options: [
          { label: 'No, stays in one place', value: 'localized', label_localized: 'नहीं, केवल एक ही जगह रहता है' },
          { label: 'Radiates to back', value: 'to_back', label_localized: 'पीठ की तरफ जाता है' },
          { label: 'Radiates to neck / arm', value: 'to_arm', label_localized: 'कंधे, गर्दन या बांह की तरफ' },
          { label: 'Spreads across abdomen', value: 'across_abdomen', label_localized: 'पूरे पेट में फैलता है' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: targetTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    // 5. Associated Symptoms
    if (!history.find((h) => h.field_key === 'socrates_associated')) {
      return {
        question: 'Are there any other symptoms accompanying the pain?',
        question_localized:
          language === 'hi'
            ? 'दर्द के साथ-साथ क्या अन्य कोई लक्षण भी हैं?'
            : 'Are there any other symptoms accompanying the pain?',
        field_key: 'socrates_associated',
        options: [
          { label: 'Fever or chills', value: 'fever', label_localized: 'बुखार या कंपकंपी' },
          { label: 'Nausea or vomiting', value: 'vomiting', label_localized: 'उल्टी या जी मिचलाना' },
          { label: 'Weakness / dizziness', value: 'weakness', label_localized: 'चक्कर या बहुत कमज़ोरी' },
          { label: 'No other symptoms', value: 'none', label_localized: 'अन्य कोई लक्षण नहीं है' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: targetTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    // 6. Severity Scale
    if (!history.find((h) => h.field_key === 'socrates_severity')) {
      return {
        question: 'How severe is the pain on a scale from mild to unbearable?',
        question_localized:
          language === 'hi'
            ? 'दर्द कितना तेज़ है? अपनी स्थिति के अनुसार चुनें:'
            : 'How severe is the pain on a scale from mild to unbearable?',
        field_key: 'socrates_severity',
        options: [
          { label: 'Mild (can do work)', value: 'mild', label_localized: 'हल्का (कामकाज कर पा रहे हैं)' },
          { label: 'Moderate (uncomfortable)', value: 'moderate', label_localized: 'मध्यम (काफी परेशानी हो रही है)' },
          { label: 'Severe (difficult to move)', value: 'severe', label_localized: 'बहुत तेज़ (उठना-बैठना कठिन है)' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: targetTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }
  } else {
    // ── GENERAL HPI PATH (Fever, Cough, General) ──────────────────────
    // 1. Duration
    if (!history.find((h) => h.field_key === 'hpi_duration')) {
      return {
        question: 'How many days have you been experiencing this problem?',
        question_localized:
          language === 'hi' ? 'यह समस्या आपको कितने दिनों से हो रही है?' : 'How many days have you been experiencing this problem?',
        field_key: 'hpi_duration',
        options: [
          { label: '1-2 days', value: '1_2_days', label_localized: '१-२ दिन से' },
          { label: '3-5 days', value: '3_5_days', label_localized: '३-५ दिन से' },
          { label: 'About a week', value: '1_week', label_localized: 'लगभग १ हफ्ते से' },
          { label: 'More than 2 weeks', value: 'more_2_weeks', label_localized: '२ हफ्ते से अधिक समय से' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: targetTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    // 2. Specific Symptom Character
    if (!history.find((h) => h.field_key === 'hpi_character')) {
      return {
        question: 'Is it getting worse, staying the same, or improving?',
        question_localized:
          language === 'hi'
            ? 'क्या आपकी परेशानी बढ़ रही है, वैसी ही है, या कुछ सुधार है?'
            : 'Is it getting worse, staying the same, or improving?',
        field_key: 'hpi_character',
        options: [
          { label: 'Getting worse', value: 'worsening', label_localized: 'दिन-प्रतिदिन बढ़ रही है' },
          { label: 'Same as before', value: 'same', label_localized: 'वैसी की वैसी ही है' },
          { label: 'Comes and goes', value: 'intermittent', label_localized: 'आती-जाती रहती है' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: targetTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    // 3. Associated Complaints
    if (!history.find((h) => h.field_key === 'hpi_associated')) {
      return {
        question: 'Do you have any of these associated symptoms?',
        question_localized:
          language === 'hi'
            ? 'क्या आपको इनमें से कोई अन्य लक्षण भी हैं?'
            : 'Do you have any of these associated symptoms?',
        field_key: 'hpi_associated',
        options: [
          { label: 'High fever or shivering', value: 'shivering', label_localized: 'तेज़ बुखार या कंपकंपी' },
          { label: 'Breathing difficulty', value: 'dyspnea', label_localized: 'सांस लेने में भारीपन या तकलीफ़' },
          { label: 'Loss of appetite / fatigue', value: 'fatigue', label_localized: 'भूख न लगना / बहुत थकान' },
          { label: 'None of these', value: 'none', label_localized: 'इनमें से कोई नहीं' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total: targetTotal },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }
  }

  // ── UNIVERSAL PAST MEDICAL & MEDICATION QUESTIONS ─────────────────
  // Past Medical History
  if (!history.find((h) => h.field_key === 'past_medical_history')) {
    return {
      question: 'Do you have any long-standing medical conditions?',
      question_localized:
        language === 'hi'
          ? 'क्या आपको पहले से इनमें से कोई पुरानी बीमारी है?'
          : 'Do you have any long-standing medical conditions?',
      field_key: 'past_medical_history',
      options: [
        { label: 'Diabetes (Sugar)', value: 'diabetes', label_localized: 'मधुमेह / शुगर (Diabetes)' },
        { label: 'High Blood Pressure (BP)', value: 'hypertension', label_localized: 'उच्च रक्तचाप / बीपी (BP)' },
        { label: 'Asthma / Breathing issue', value: 'asthma', label_localized: 'अस्थमा / दमा (Asthma)' },
        { label: 'Heart disease', value: 'heart_disease', label_localized: 'हृदय रोग (Heart Disease)' },
        { label: 'None / Healthy', value: 'none', label_localized: 'कोई पुरानी बीमारी नहीं है' },
      ],
      allow_free_voice: true,
      progress: { current: turnCount + 1, total: targetTotal },
      is_complete: false,
      red_flag: false,
      red_flag_reason: null,
      severity: null,
    }
  }

  // Drug & Allergy History
  if (!history.find((h) => h.field_key === 'drug_and_allergy')) {
    return {
      question: 'Are you currently taking any medicines or do you have any medicine allergies?',
      question_localized:
        language === 'hi'
          ? 'क्या आप कोई दवा नियमित लेते हैं, या किसी दवा से एलर्जी है?'
          : 'Are you currently taking any medicines or do you have any medicine allergies?',
      field_key: 'drug_and_allergy',
      options: [
        { label: 'Taking daily medicines', value: 'daily_meds', label_localized: 'हाँ, रोज़ाना दवाइयाँ लेता हूँ' },
        { label: 'Have drug allergies', value: 'has_allergy', label_localized: 'हाँ, कुछ दवाइयों से एलर्जी है' },
        { label: 'Took Paracetamol/OTC today', value: 'paracetamol', label_localized: 'आज ही दर्द/बुखार की गोली ली थी' },
        { label: 'No regular medicine or allergy', value: 'none', label_localized: 'कोई नियमित दवा या एलर्जी नहीं' },
      ],
      allow_free_voice: true,
      progress: { current: turnCount + 1, total: targetTotal },
      is_complete: false,
      red_flag: false,
      red_flag_reason: null,
      severity: null,
    }
  }

  // Final confirmation turn
  return {
    question: 'Thank you. Is there anything else you would like the doctor to know?',
    question_localized:
      language === 'hi'
        ? 'धन्यवाद। क्या डॉक्टर को बताने के लिए कोई अन्य बात बाकी है?'
        : 'Thank you. Is there anything else you would like the doctor to know?',
    field_key: 'additional_notes',
    options: [
      { label: 'No, that is all', value: 'all_done', label_localized: 'नहीं, यही मुख्य बात है' },
      { label: 'Have old reports to scan', value: 'has_reports', label_localized: 'मेरे पास पुराने पर्चे/रिपोर्ट हैं' },
    ],
    allow_free_voice: true,
    progress: { current: targetTotal, total: targetTotal },
    is_complete: true,
    red_flag: false,
    red_flag_reason: null,
    severity: null,
  }
}

// Serve Edge Function HTTP Handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: InterviewRequest = await req.json()
    const { history = [], language = 'hi', department = 'general_medicine' } = payload

    const nextTurn = await decideNextQuestion(history, language, department)

    return new Response(JSON.stringify(nextTurn), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      status: 200,
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      status: 500,
    })
  }
})
