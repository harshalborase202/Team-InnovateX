import { SupportedLanguage } from './translations'
import { isGeminiConfigured, generateGeminiInterviewTurn } from './geminiClient'

export interface ConversationTurn {
  field_key: string
  question: string
  answer: string
  source?: 'voice' | 'touch'
}

export interface InterviewOption {
  label: string
  value: string
  label_localized: string
}

export interface InterviewStepResponse {
  question: string
  question_localized: string
  field_key: string
  options: InterviewOption[]
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

// Client-side clinical rule engine (exact parity with the Edge Function)
// Ensures 100% kiosk resilience regardless of edge function deployment status
export async function getNextInterviewQuestion(
  _sessionId: string,
  history: ConversationTurn[],
  language: SupportedLanguage = 'hi',
  department: string = 'general_medicine'
): Promise<InterviewStepResponse> {
  const isAyush = department === 'ayush' || department.includes('ayush')
  const MAX_QUESTIONS = isAyush ? 6 : 7

  // HARD CAP: If 7 questions reached, ALWAYS return completion response immediately!
  if (history.length >= MAX_QUESTIONS) {
    return evaluateClientClinicalTree(history, language, department)
  }

  // 1. Try Gemini AI with a strict 2-second timeout if configured
  if (isGeminiConfigured() && history.length > 0 && history.length < MAX_QUESTIONS - 1) {
    try {
      // 2-second timeout promise to prevent any UI stall
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), 2000)
      )

      const geminiPromise = generateGeminiInterviewTurn({
        history: history.map((h) => ({
          field_key: h.field_key,
          question: h.question,
          answer: h.answer,
        })),
        language,
        department,
      })

      const geminiResult = await Promise.race([geminiPromise, timeoutPromise])

      if (geminiResult && geminiResult.question) {
        // Ensure Gemini doesn't repeat an already answered topic
        const isDuplicate = history.some(
          (h) => h.field_key === geminiResult.field_key || h.question === geminiResult.question
        )

        if (!isDuplicate) {
          // Force strict cap on progress display
          return {
            ...geminiResult,
            progress: {
              current: Math.min(history.length + 1, MAX_QUESTIONS),
              total: MAX_QUESTIONS,
            },
            is_complete: history.length + 1 >= MAX_QUESTIONS,
          } as InterviewStepResponse
        }
      }
    } catch {
      // Gemini timed out or 429 quota reached; use instant deterministic clinical tree
    }
  }

  // 2. Deterministic SOCRATES, HPI, & AYUSH clinical reasoning engine
  return evaluateClientClinicalTree(history, language, department)
}

// Red flag evaluation
export function detectRedFlags(history: ConversationTurn[]): {
  red_flag: boolean
  reason: string | null
  severity: 'critical' | 'high' | 'medium' | null
} {
  const text = history.map((h) => `${h.field_key}: ${h.answer}`).join(' ').toLowerCase()

  // 1. Cardiac / Severe Dyspnea
  if (
    (text.includes('chest') || text.includes('सीने') || text.includes('छाती') || text.includes('heart')) &&
    (text.includes('breath') || text.includes('सांस') || text.includes('दम') || text.includes('sweat') || text.includes('heavy') || text.includes('दबाव'))
  ) {
    return {
      red_flag: true,
      reason: 'Potential Acute Coronary Syndrome (Chest discomfort with respiratory distress/sweating)',
      severity: 'critical',
    }
  }

  // 2. Stroke / Severe Neuro
  if (
    (text.includes('sudden') || text.includes('अचानक')) &&
    (text.includes('headache') || text.includes('सिर दर्द') || text.includes('worst'))
  ) {
    return {
      red_flag: true,
      reason: 'Sudden severe thunderclap headache',
      severity: 'critical',
    }
  }

  if (
    text.includes('paralysis') ||
    text.includes('weakness in face') ||
    text.includes('speech slurred') ||
    text.includes('लकवा') ||
    text.includes('मुंह टेढ़ा')
  ) {
    return {
      red_flag: true,
      reason: 'Potential Acute Stroke (Facial droop / unilateral weakness / speech difficulty)',
      severity: 'critical',
    }
  }

  // 3. Bleeding
  if (text.includes('blood') || text.includes('खून')) {
    if (text.includes('vomit') || text.includes('उल्टी') || text.includes('cough') || text.includes('खाँसी')) {
      return {
        red_flag: true,
        reason: 'Active hemorrhage or hemoptysis',
        severity: 'high',
      }
    }
  }

  return { red_flag: false, reason: null, severity: null }
}

function evaluateClientClinicalTree(
  history: ConversationTurn[],
  language: SupportedLanguage,
  department: string = 'general_medicine'
): InterviewStepResponse {
  // Check red flags first
  const flag = detectRedFlags(history)
  if (flag.red_flag) {
    return {
      question: 'Immediate Clinical Alert: Red flag emergency symptoms detected.',
      question_localized:
        language === 'hi'
          ? 'आपातकालीन लक्षण पाए गए हैं। कृपया तुरंत ओपीडी स्वास्थ्य कर्मी को सूचित करें।'
          : 'Immediate Clinical Alert: Red flag emergency symptoms detected. Please notify staff immediately.',
      field_key: 'emergency_alert',
      options: [],
      allow_free_voice: false,
      progress: { current: history.length, total: 10 },
      is_complete: false,
      red_flag: true,
      red_flag_reason: flag.reason,
      severity: flag.severity,
    }
  }

  const turnCount = history.length
  const isAyush = department === 'ayush' || department.includes('ayush') || department.includes('ayurveda')

  // ═══════════════════════════════════════════════════════════════════
  // AYUSH / AYURVEDIC CLINICAL INTERVIEW BRANCH
  // ═══════════════════════════════════════════════════════════════════
  if (isAyush) {
    const ayushTotal = 6

    // Completion Check for AYUSH
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

    // Question 1: Chief Complaint
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

    // Question 2: Prakriti (प्रकृति - Body Constitution)
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

    // Question 3: Vikriti (विकृति - Current Imbalance)
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

    // Question 4: Agni (जठराग्नि - Digestive Power)
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

    // Question 5: Koshtha (कोष्ठ - Bowel Nature)
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

    // Question 6: Ahara-Vihara (आहार-विहार - Diet & Routine)
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

  // ═══════════════════════════════════════════════════════════════════
  // ALLOPATHIC / GENERAL OPD INTERVIEW BRANCH (SOCRATES + HPI)
  // ═══════════════════════════════════════════════════════════════════
  const chief = history.find((h) => h.field_key === 'chief_complaint')?.answer?.toLowerCase() || ''
  const isPain = chief.includes('pain') || chief.includes('दर्द') || chief.includes('stomach') || chief.includes('body')
  const total = 7 // Hard cap: exactly 7 questions max

  // Completion check
  if (turnCount >= total) {
    return {
      question: 'Thank you. We have gathered sufficient health history for your consultation.',
      question_localized:
        language === 'hi'
          ? 'धन्यवाद। डॉक्टर के लिए पर्याप्त स्वास्थ्य जानकारी एकत्र कर ली गई है।'
          : 'Thank you. We have gathered sufficient health history for your consultation.',
      field_key: 'interview_completed',
      options: [
        {
          label: 'Proceed to Report Scanning',
          value: 'proceed',
          label_localized: language === 'hi' ? 'दस्तावेज़ स्कैनिंग के लिए आगे बढ़ें ➔' : 'Proceed to Report Scanning ➔',
        },
      ],
      allow_free_voice: false,
      progress: { current: total, total },
      is_complete: true,
      red_flag: false,
      red_flag_reason: null,
      severity: null,
    }
  }

  // Turn 0: Chief Complaint
  if (turnCount === 0) {
    return {
      question: 'What is bothering you today?',
      question_localized:
        language === 'hi'
          ? 'आज आपको क्या मुख्य समस्या या तकलीफ़ है?'
          : 'What is bothering you today?',
      field_key: 'chief_complaint',
      options: [
        { label: 'Fever', value: 'fever', label_localized: '🌡️ बुखार (Fever)' },
        { label: 'Cough / Cold', value: 'cough', label_localized: '🗣️ खाँसी / ज़ुकाम (Cough)' },
        { label: 'Stomach Pain', value: 'stomach_pain', label_localized: '🤢 पेट दर्द (Stomach Pain)' },
        { label: 'Body / Joint Pain', value: 'body_pain', label_localized: '⚡ बदन / जोड़ों का दर्द (Body Pain)' },
        { label: "Women's Health", value: 'womens_health', label_localized: "🌸 महिला स्वास्थ्य (Women's Health)" },
        { label: 'Skin Problem', value: 'skin', label_localized: '🩹 त्वचा / दाद-खुजली (Skin)' },
        { label: 'Chest pain & breathlessness', value: 'chest_pain_severe', label_localized: '⚠️ सीने में दर्द और सांस फूलना (Chest Pain)' },
      ],
      allow_free_voice: true,
      progress: { current: 1, total },
      is_complete: false,
      red_flag: false,
      red_flag_reason: null,
      severity: null,
    }
  }

  // SOCRATES (Pain) Path
  if (isPain) {
    if (!history.find((h) => h.field_key === 'socrates_site')) {
      return {
        question: 'Where exactly is the pain located?',
        question_localized:
          language === 'hi' ? 'दर्द शरीर में ठीक किस जगह पर हो रहा है?' : 'Where exactly is the pain located?',
        field_key: 'socrates_site',
        options: [
          { label: 'Upper abdomen', value: 'upper_abdomen', label_localized: 'पेट के ऊपरी हिस्से में' },
          { label: 'Lower abdomen', value: 'lower_abdomen', label_localized: 'पेट के निचले हिस्से में' },
          { label: 'Back / Spine', value: 'back', label_localized: 'कमर या पीठ में' },
          { label: 'Head / Forehead', value: 'head', label_localized: 'सिर या माथे में' },
          { label: 'Joints / Legs', value: 'joints', label_localized: 'घुटनों / जोड़ों में' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (!history.find((h) => h.field_key === 'socrates_onset')) {
      return {
        question: 'When did this pain start?',
        question_localized:
          language === 'hi' ? 'यह दर्द कब से शुरू हुआ है?' : 'When did this pain start?',
        field_key: 'socrates_onset',
        options: [
          { label: 'Today (Sudden)', value: 'today_sudden', label_localized: 'आज ही अचानक शुरू हुआ' },
          { label: '2-3 days ago', value: '2_3_days', label_localized: '२-३ दिनों से' },
          { label: 'Over a week ago', value: '1_week', label_localized: '१ हफ्ते से अधिक' },
          { label: 'Long-standing (months)', value: 'chronic', label_localized: 'काफी महीनों से' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (!history.find((h) => h.field_key === 'socrates_character')) {
      return {
        question: 'What does the pain feel like?',
        question_localized:
          language === 'hi' ? 'दर्द किस प्रकार का महसूस होता है?' : 'What does the pain feel like?',
        field_key: 'socrates_character',
        options: [
          { label: 'Sharp / Stabbing', value: 'sharp', label_localized: 'तीखा या चुभने जैसा' },
          { label: 'Dull / Heavy', value: 'dull', label_localized: 'हल्का-हल्का भारी दर्द' },
          { label: 'Burning', value: 'burning', label_localized: 'जलन जैसा दर्द' },
          { label: 'Cramping / Colicky', value: 'cramping', label_localized: 'मरोड़ या ऐंठन जैसा' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (!history.find((h) => h.field_key === 'socrates_severity')) {
      return {
        question: 'How severe is the pain right now?',
        question_localized:
          language === 'hi' ? 'अभी दर्द कितना तेज़ है?' : 'How severe is the pain right now?',
        field_key: 'socrates_severity',
        options: [
          { label: 'Mild (tolerable)', value: 'mild', label_localized: 'हल्का (सहन करने योग्य)' },
          { label: 'Moderate', value: 'moderate', label_localized: 'मध्यम (काफी परेशानी)' },
          { label: 'Severe (unbearable)', value: 'severe', label_localized: 'बहुत तेज़ (असहनीय)' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }
  } else {
    // General HPI Path
    if (!history.find((h) => h.field_key === 'hpi_duration')) {
      return {
        question: 'How many days have you had these symptoms?',
        question_localized:
          language === 'hi' ? 'यह लक्षण आपको कितने दिनों से हैं?' : 'How many days have you had these symptoms?',
        field_key: 'hpi_duration',
        options: [
          { label: '1-2 days', value: '1_2_days', label_localized: '१-२ दिन से' },
          { label: '3-5 days', value: '3_5_days', label_localized: '३-५ दिन से' },
          { label: 'About a week', value: '1_week', label_localized: 'लगभग १ हफ्ते से' },
          { label: 'Over 2 weeks', value: 'more_2_weeks', label_localized: '२ हफ्ते से अधिक' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }

    if (!history.find((h) => h.field_key === 'hpi_progression')) {
      return {
        question: 'Is the condition getting worse or staying the same?',
        question_localized:
          language === 'hi' ? 'क्या तकलीफ़ बढ़ रही है या वैसी ही है?' : 'Is the condition getting worse or staying the same?',
        field_key: 'hpi_progression',
        options: [
          { label: 'Getting worse', value: 'worsening', label_localized: 'दिन-ब-दिन बढ़ रही है' },
          { label: 'Staying the same', value: 'same', label_localized: 'वैसी की वैसी ही है' },
          { label: 'Comes and goes', value: 'intermittent', label_localized: 'आती-जाती रहती है' },
        ],
        allow_free_voice: true,
        progress: { current: turnCount + 1, total },
        is_complete: false,
        red_flag: false,
        red_flag_reason: null,
        severity: null,
      }
    }
  }

  // Universal Past Medical & Medications
  if (!history.find((h) => h.field_key === 'past_medical_history')) {
    return {
      question: 'Do you have any prior medical conditions (like BP, Sugar, or Asthma)?',
      question_localized:
        language === 'hi'
          ? 'क्या आपको बीपी, शुगर (मधुमेह) या दमा जैसी कोई पुरानी बीमारी है?'
          : 'Do you have any prior medical conditions (like BP, Sugar, or Asthma)?',
      field_key: 'past_medical_history',
      options: [
        { label: 'Diabetes (Sugar)', value: 'diabetes', label_localized: 'शुगर / मधुमेह (Diabetes)' },
        { label: 'High BP', value: 'hypertension', label_localized: 'उच्च रक्तचाप (High BP)' },
        { label: 'Both Sugar & BP', value: 'both', label_localized: 'शुगर और बीपी दोनों' },
        { label: 'Asthma / Breathing', value: 'asthma', label_localized: 'दमा / अस्थमा' },
        { label: 'No prior conditions', value: 'none', label_localized: 'कोई पुरानी बीमारी नहीं' },
      ],
      allow_free_voice: true,
      progress: { current: turnCount + 1, total },
      is_complete: false,
      red_flag: false,
      red_flag_reason: null,
      severity: null,
    }
  }

  if (!history.find((h) => h.field_key === 'regular_meds')) {
    return {
      question: 'Are you taking any regular medications or do you have any allergies?',
      question_localized:
        language === 'hi'
          ? 'क्या आप कोई नियमित दवाई लेते हैं, या किसी दवा से एलर्जी है?'
          : 'Are you taking any regular medications or do you have any allergies?',
      field_key: 'regular_meds',
      options: [
        { label: 'Taking daily medicines', value: 'daily_meds', label_localized: 'हाँ, नियमित दवाई ले रहा हूँ' },
        { label: 'Have medicine allergies', value: 'has_allergy', label_localized: 'हाँ, दवाइयों से एलर्जी है' },
        { label: 'Took painkiller today', value: 'took_painkiller', label_localized: 'आज ही दर्द की गोली ली थी' },
        { label: 'No regular medicines', value: 'none', label_localized: 'कोई नियमित दवा नहीं' },
      ],
      allow_free_voice: true,
      progress: { current: turnCount + 1, total },
      is_complete: false,
      red_flag: false,
      red_flag_reason: null,
      severity: null,
    }
  }

  // Ready to wrap up
  return {
    question: 'Thank you. We are ready to scan your old prescriptions and reports.',
    question_localized:
      language === 'hi'
        ? 'धन्यवाद। अब हम आपके पुराने पर्चे और जाँच रिपोर्ट स्कैन करने के लिए तैयार हैं।'
        : 'Thank you. We are ready to scan your old prescriptions and reports.',
    field_key: 'ready_for_scan',
    options: [
      { label: 'Proceed to Scanner', value: 'proceed_scan', label_localized: 'स्कैनर पर आगे बढ़ें ➔' },
    ],
    allow_free_voice: false,
    progress: { current: total, total },
    is_complete: true,
    red_flag: false,
    red_flag_reason: null,
    severity: null,
  }
}
