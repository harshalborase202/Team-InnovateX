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

// Helper for clean multi-lingual localization across all 6 supported languages
function loc(
  language: SupportedLanguage,
  translations: { en: string; hi: string; mr: string; ta?: string; bn?: string; te?: string }
): string {
  const target = translations[language]
  if (target) return target
  if (language === 'mr') return translations.mr
  if (language === 'hi') return translations.hi
  return translations.en
}

// Red flag evaluation
export function detectRedFlags(history: ConversationTurn[]): {
  red_flag: boolean
  reason: string | null
  severity: 'critical' | 'high' | 'medium' | null
} {
  const text = history.map((h) => `${h.field_key}: ${h.answer}`).join(' ').toLowerCase()

  // 1. Cardiac / Severe Dyspnea (supports English, Hindi, and Marathi)
  if (
    (text.includes('chest') || text.includes('सीने') || text.includes('छाती') || text.includes('छातीत') || text.includes('heart') || text.includes('हृदय')) &&
    (text.includes('breath') || text.includes('सांस') || text.includes('दम') || text.includes('श्वास') || text.includes('sweat') || text.includes('घाम') || text.includes('heavy') || text.includes('दबाव') || text.includes('जड'))
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
    (text.includes('headache') || text.includes('सिर दर्द') || text.includes('डोकेदुखी') || text.includes('worst'))
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
    text.includes('मुंह टेढ़ा') ||
    text.includes('अर्धांगवायू') ||
    text.includes('पक्षाघात') ||
    text.includes('तोंड वाकडे')
  ) {
    return {
      red_flag: true,
      reason: 'Potential Acute Stroke (Facial droop / unilateral weakness / speech difficulty)',
      severity: 'critical',
    }
  }

  // 3. Bleeding
  if (text.includes('blood') || text.includes('खून') || text.includes('रक्त')) {
    if (text.includes('vomit') || text.includes('उल्टी') || text.includes('खोकला') || text.includes('cough') || text.includes('खाँसी')) {
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
      question_localized: loc(language, {
        en: 'Immediate Clinical Alert: Red flag emergency symptoms detected. Please notify staff immediately.',
        hi: 'आपातकालीन लक्षण पाए गए हैं। कृपया तुरंत ओपीडी स्वास्थ्य कर्मी को सूचित करें।',
        mr: 'तात्काळ वैद्यकीय सूचना: गंभीर आणीबाणीची लक्षणे आढळली आहेत. कृपया ताबडतोब आरोग्य कर्मचाऱ्यांना कळवा.',
      }),
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
        question_localized: loc(language, {
          en: 'Thank you. Your AYUSH clinical profile and health history are recorded.',
          hi: 'धन्यवाद। आपकी प्रकृति, अग्नि, कोष्ठ व स्वास्थ्य विवरण सफलतापूर्वक दर्ज कर लिया गया है।',
          mr: 'धन्यवाद. तुमची प्रकृती, अग्नी, कोष्ठ व आरोग्य माहिती यशस्वीरीत्या नोंदवली गेली आहे.',
        }),
        field_key: 'interview_completed',
        options: [
          {
            label: 'Proceed to Report Scanning',
            value: 'proceed',
            label_localized: loc(language, {
              en: 'Proceed to Report Scanning ➔',
              hi: 'दस्तावेज़ स्कैनिंग के लिए आगे बढ़ें ➔',
              mr: 'तपासणी अहवाल स्कॅनिंगसाठी पुढे जा ➔',
            }),
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
        question_localized: loc(language, {
          en: 'What is your primary health complaint today?',
          hi: 'आज आपको क्या मुख्य स्वास्थ्य तकलीफ़ या समस्या है?',
          mr: 'आज तुम्हाला कोणती मुख्य आरोग्य समस्या किंवा त्रास होत आहे?',
        }),
        field_key: 'chief_complaint',
        options: [
          {
            label: 'Indigestion / Gas / Acidity',
            value: 'digestion',
            label_localized: loc(language, {
              en: '🔥 Indigestion, Gas or Acidity',
              hi: '🔥 गैस, बदहजमी या एसिडिटी (Digestion)',
              mr: '🔥 ॲसिडिटी, अपचन किंवा गॅस (Digestion)',
            }),
          },
          {
            label: 'Joint Pain / Vata Vyadhi',
            value: 'joint_pain',
            label_localized: loc(language, {
              en: '⚡ Joint or Body Pain (Vata)',
              hi: '⚡ जोड़ों या बदन का दर्द (Joint Pain)',
              mr: '⚡ सांधेदुखी किंवा अंगदुखी (Joint Pain)',
            }),
          },
          {
            label: 'Cough / Cold / Respiratory',
            value: 'cough',
            label_localized: loc(language, {
              en: '🗣️ Cough, Cold or Breathing',
              hi: '🗣️ खाँसी, बलगम या दमा (Respiratory)',
              mr: '🗣️ खोकला, कफ किंवा दम (Respiratory)',
            }),
          },
          {
            label: 'Skin Conditions / Rashes',
            value: 'skin',
            label_localized: loc(language, {
              en: '🩹 Skin Conditions / Rashes',
              hi: '🩹 त्वचा रोग / खुजली / दाद (Skin)',
              mr: '🩹 त्वचेचे आजार / खाज / पुरळ (Skin)',
            }),
          },
          {
            label: 'Weakness / Low Energy',
            value: 'fatigue',
            label_localized: loc(language, {
              en: '💤 Weakness / Fatigue',
              hi: '💤 कमज़ोरी या थकान (Fatigue)',
              mr: '💤 अशक्तपणा किंवा थकवा (Fatigue)',
            }),
          },
          {
            label: 'Other',
            value: 'other',
            label_localized: loc(language, {
              en: '❓ Other Problem',
              hi: '❓ अन्य समस्या (Other)',
              mr: '❓ इतर समस्या (Other)',
            }),
          },
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
        question_localized: loc(language, {
          en: 'Prakriti: What is your natural body build, appetite, and weather tolerance?',
          hi: 'प्रकृति (शारीरिक गठन): आपकी स्वाभाविक शारीरिक बनावट और मौसम सहनशीलता कैसी है?',
          mr: 'प्रकृती (शारीरिक ठेवण): तुमची मूळ शारीरिक ठेवण आणि हवामान सहनशीलता कशी आहे?',
        }),
        field_key: 'ayush_prakriti',
        options: [
          {
            label: 'Vata: Lean build, easily feels cold, active/restless mind',
            value: 'vata',
            label_localized: loc(language, {
              en: '💨 Vata: Lean build, easily cold, restless mind',
              hi: '💨 वात: दुबला शरीर, जल्दी ठंड लगना, चंचल स्वभाव',
              mr: '💨 वात: सडपातळ शरीर, लवकर थंडी वाजणे, चंचल स्वभाव',
            }),
          },
          {
            label: 'Pitta: Medium build, feels heat/sweat quickly, sharp appetite',
            value: 'pitta',
            label_localized: loc(language, {
              en: '🔥 Pitta: Medium build, feels heat quickly, sharp appetite',
              hi: '🔥 पित्त: मध्यम शरीर, अधिक गर्मी/पसीना, तेज़ भूख',
              mr: '🔥 पित्त: मध्यम बांधा, जास्त उष्णता/घाम, तीव्र भूक',
            }),
          },
          {
            label: 'Kapha: Solid/heavy build, calm nature, sound sleep',
            value: 'kapha',
            label_localized: loc(language, {
              en: '💧 Kapha: Solid build, calm nature, sound sleep',
              hi: '💧 कफ: मजबूत/भारी शरीर, शांत स्वभाव, गहरी नींद',
              mr: '💧 कफ: मजबूत/कणखर शरीर, शांत स्वभाव, गाढ झोप',
            }),
          },
          {
            label: 'Mixed / Balanced: Combination of doshas',
            value: 'mixed',
            label_localized: loc(language, {
              en: '⚖️ Mixed / Balanced (Combination)',
              hi: '⚖️ मिश्रित: मिले-जुले लक्षण (Combination)',
              mr: '⚖️ मिश्र / संतुलित: संमिश्र लक्षणे (Combination)',
            }),
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
        question_localized: loc(language, {
          en: 'Vikriti: Which doshic imbalance feels most disturbed currently?',
          hi: 'विकृति (वर्तमान असंतुलन): अभी आपको मुख्य रूप से किस प्रकार की तकलीफ़ महसूस हो रही है?',
          mr: 'विकृती (सध्याचे असंतुलन): सध्या तुम्हाला प्रामुख्याने कोणत्या प्रकारचा त्रास जाणवत आहे?',
        }),
        field_key: 'ayush_vikriti',
        options: [
          {
            label: 'Vata imbalance: Joint aches, gas, constipation, restlessness',
            value: 'vata_imbalance',
            label_localized: loc(language, {
              en: '💨 Vata imbalance: Joint aches, gas, constipation',
              hi: '💨 वात असंतुलन: जोड़ों में दर्द, गैस, अनिद्रा या रूखापन',
              mr: '💨 वात असंतुलन: सांधेदुखी, गॅस, बद्धकोष्ठता किंवा अस्वस्थता',
            }),
          },
          {
            label: 'Pitta imbalance: Acidity, burning sensations, skin heat, mouth ulcers',
            value: 'pitta_imbalance',
            label_localized: loc(language, {
              en: '🔥 Pitta imbalance: Acidity, burning, skin heat',
              hi: '🔥 पित्त असंतुलन: एसिडिटी, जलन, मुँह में छाले या गुस्सा',
              mr: '🔥 पित्त असंतुलन: ॲसिडिटी, जळजळ, तोंडाला चटके किंवा पुरळ',
            }),
          },
          {
            label: 'Kapha imbalance: Heaviness in body, excess phlegm, lethargy, weight gain',
            value: 'kapha_imbalance',
            label_localized: loc(language, {
              en: '💧 Kapha imbalance: Heaviness, excess phlegm, lethargy',
              hi: '💧 कफ असंतुलन: भारीपन, बलगम, अत्यधिक सुस्ती व कफ',
              mr: '💧 कफ असंतुलन: शरीरात जडपणा, जास्त कफ, सुस्ती व आळस',
            }),
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
        question_localized: loc(language, {
          en: 'Agni: How is your daily appetite and digestive strength?',
          hi: 'जठराग्नि (पाचन शक्ति): आपकी भूख और भोजन पचाने की शक्ति कैसी है?',
          mr: 'जठराग्नी (पचनशक्ती): तुमची भूक आणि अन्न पचनाची क्षमता कशी आहे?',
        }),
        field_key: 'ayush_agni',
        options: [
          {
            label: 'Samagni: Normal appetite, food digests easily on time',
            value: 'samagni',
            label_localized: loc(language, {
              en: '🟢 Samagni: Normal appetite, digests on time',
              hi: '🟢 समाग्नि: नियमित भूख, खाना आसानी से पचता है',
              mr: '🟢 समाग्नी: वेळेवर भूक, जेवण सहज पचते',
            }),
          },
          {
            label: 'Tikshnagni: Very intense hunger, burning/acidity if delayed',
            value: 'tikshnagni',
            label_localized: loc(language, {
              en: '🔴 Tikshnagni: Sharp hunger, acidity if delayed',
              hi: '🔴 तीक्ष्णाग्नि: बहुत तेज़ भूख, न खाने पर एसिडिटी व जलन',
              mr: '🔴 तीक्ष्णाग्नी: तीव्र भूक, न जेवल्यास जळजळ व ॲसिडिटी',
            }),
          },
          {
            label: 'Mandagni: Poor appetite, feels heavy/bloated after eating',
            value: 'mandagni',
            label_localized: loc(language, {
              en: '🟡 Mandagni: Poor appetite, bloated after eating',
              hi: '🟡 मन्दाग्नि: भूख बहुत कम, खाने के बाद भारीपन व फूला पेट',
              mr: '🟡 मंदाग्नी: भूक कमी, जेवणानंतर जडपणा व पोट फुगणे',
            }),
          },
          {
            label: 'Vishamagni: Irregular appetite, unpredictable digestion',
            value: 'vishamagni',
            label_localized: loc(language, {
              en: '🔵 Vishamagni: Irregular, unpredictable appetite',
              hi: '🔵 विषमाग्नि: कभी बहुत भूख, कभी बिल्कुल नहीं',
              mr: '🔵 विषमाग्नी: कधी खूप भूक, कधी अजिबात भूक नाही',
            }),
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
        question_localized: loc(language, {
          en: 'Koshtha: How is your bowel evacuation nature?',
          hi: 'कोष्ठ (पेट साफ होने की प्रकृति): आपका शौच / पेट साफ होने की आदत कैसी है?',
          mr: 'कोष्ठ (पोट साफ होणे): तुमचे पोट साफ होण्याचे प्रमाण कसे आहे?',
        }),
        field_key: 'ayush_koshtha',
        options: [
          {
            label: 'Mrudu Koshtha: Soft, easy evacuation even with warm milk',
            value: 'mrudu',
            label_localized: loc(language, {
              en: '💧 Mrudu: Easy, soft bowel evacuation',
              hi: '💧 मृदु कोष्ठ: आसानी से/दूध से भी तुरंत पेट साफ होता है',
              mr: '💧 मृदू कोष्ठ: कोमट दुधानेही सहज पोट साफ होते',
            }),
          },
          {
            label: 'Madhyama Koshtha: Normal, comfortable daily evacuation',
            value: 'madhyama',
            label_localized: loc(language, {
              en: '⚖️ Madhyama: Normal 1-2 times daily',
              hi: '⚖️ मध्यम कोष्ठ: दिन में १-२ बार सामान्य रूप से साफ होता है',
              mr: '⚖️ मध्यम कोष्ठ: दिवसातून १-२ वेळा सामान्यपणे साफ होते',
            }),
          },
          {
            label: 'Krura Koshtha: Hard, dry stool, tendency towards constipation',
            value: 'krura',
            label_localized: loc(language, {
              en: '🪨 Krura: Hard stools, constipation tendency',
              hi: '🪨 क्रूर कोष्ठ: कब्ज रहता है, मल कड़ा होता है, ज़ोर लगाना पड़ता है',
              mr: '🪨 क्रूर कोष्ठ: बद्धकोष्ठता, मलमूत्र कठीण, त्रास होतो',
            }),
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
        question_localized: loc(language, {
          en: 'Ahara-Vihara: What describes your daily diet and lifestyle habits?',
          hi: 'आहार-विहार (दिनचर्या): आपकी दैनिक खानपान और सोने-जागने की मुख्य आदत कैसी है?',
          mr: 'आहार-विहार (दिनचर्या): तुमच्या खाण्यापिण्याच्या आणि झोपण्याच्या सवयी कशा आहेत?',
        }),
        field_key: 'ayush_ahara_vihara',
        options: [
          {
            label: 'Satvik / Light home food, regular sleep routine',
            value: 'satvik_regular',
            label_localized: loc(language, {
              en: '🥗 Home cooked light food, regular sleep',
              hi: '🥗 सादा घर का भोजन, समय पर सोना और जागना',
              mr: '🥗 साधे घरचे जेवण, वेळेवर झोपणे व उठणे',
            }),
          },
          {
            label: 'Spicy / oily / heavy food, irregular meal timings',
            value: 'spicy_irregular',
            label_localized: loc(language, {
              en: '🌶️ Spicy, oily or irregular meal timings',
              hi: '🌶️ तीखा, तला-भुना या अनियमित समय पर भोजन',
              mr: '🌶️ तिखट, तेलकट किंवा अवेळी जेवण',
            }),
          },
          {
            label: 'Late night sleeping, high stress or sedentary routine',
            value: 'late_nights_stress',
            label_localized: loc(language, {
              en: '⏰ Late nights, stress or lack of exercise',
              hi: '⏰ देर रात तक जागना, तनाव व शारीरिक श्रम की कमी',
              mr: '⏰ रात्री उशिरा झोपणे, ताणतणाव व व्यायामाचा अभाव',
            }),
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
      question_localized: loc(language, {
        en: 'Thank you. We have gathered sufficient health history for your consultation.',
        hi: 'धन्यवाद। डॉक्टर के लिए पर्याप्त स्वास्थ्य जानकारी एकत्र कर ली गई है।',
        mr: 'धन्यवाद. डॉक्टरांसाठी पुरेशी वैद्यकीय माहिती नोंदवून घेतली आहे.',
      }),
      field_key: 'interview_completed',
      options: [
        {
          label: 'Proceed to Report Scanning',
          value: 'proceed',
          label_localized: loc(language, {
            en: 'Proceed to Report Scanning ➔',
            hi: 'दस्तावेज़ स्कैनिंग के लिए आगे बढ़ें ➔',
            mr: 'तपासणी अहवाल स्कॅनिंगसाठी पुढे जा ➔',
          }),
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
      question_localized: loc(language, {
        en: 'What is bothering you today?',
        hi: 'आज आपको क्या मुख्य समस्या या तकलीफ़ है?',
        mr: 'आज तुम्हाला कोणती मुख्य समस्या किंवा त्रास होत आहे?',
      }),
      field_key: 'chief_complaint',
      options: [
        {
          label: 'Fever',
          value: 'fever',
          label_localized: loc(language, {
            en: '🌡️ Fever',
            hi: '🌡️ बुखार (Fever)',
            mr: '🌡️ ताप (Fever)',
          }),
        },
        {
          label: 'Cough / Cold',
          value: 'cough',
          label_localized: loc(language, {
            en: '🗣️ Cough / Cold',
            hi: '🗣️ खाँसी / ज़ुकाम (Cough)',
            mr: '🗣️ खोकला / सर्दी (Cough)',
          }),
        },
        {
          label: 'Stomach Pain',
          value: 'stomach_pain',
          label_localized: loc(language, {
            en: '🤢 Stomach Pain',
            hi: '🤢 पेट दर्द (Stomach Pain)',
            mr: '🤢 पोटदुखी (Stomach Pain)',
          }),
        },
        {
          label: 'Body / Joint Pain',
          value: 'body_pain',
          label_localized: loc(language, {
            en: '⚡ Body / Joint Pain',
            hi: '⚡ बदन / जोड़ों का दर्द (Body Pain)',
            mr: '⚡ अंगदुखी / सांधेदुखी (Body Pain)',
          }),
        },
        {
          label: "Women's Health",
          value: 'womens_health',
          label_localized: loc(language, {
            en: "🌸 Women's Health",
            hi: "🌸 महिला स्वास्थ्य (Women's Health)",
            mr: "🌸 महिला आरोग्य (Women's Health)",
          }),
        },
        {
          label: 'Skin Problem',
          value: 'skin',
          label_localized: loc(language, {
            en: '🩹 Skin Problem / Rash',
            hi: '🩹 त्वचा / दाद-खुजली (Skin)',
            mr: '🩹 त्वचेची समस्या / खाज (Skin)',
          }),
        },
        {
          label: 'Chest pain & breathlessness',
          value: 'chest_pain_severe',
          label_localized: loc(language, {
            en: '⚠️ Chest Pain & Breathlessness',
            hi: '⚠️ सीने में दर्द और सांस फूलना (Chest Pain)',
            mr: '⚠️ छातीत दुखणे आणि श्वास घेण्यास त्रास (Chest Pain)',
          }),
        },
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
        question_localized: loc(language, {
          en: 'Where exactly is the pain located?',
          hi: 'दर्द शरीर में ठीक किस जगह पर हो रहा है?',
          mr: 'शरीरात नेमके कुठे दुखत आहे?',
        }),
        field_key: 'socrates_site',
        options: [
          {
            label: 'Upper abdomen',
            value: 'upper_abdomen',
            label_localized: loc(language, {
              en: 'Upper abdomen',
              hi: 'पेट के ऊपरी हिस्से में',
              mr: 'पोटाच्या वरच्या भागात',
            }),
          },
          {
            label: 'Lower abdomen',
            value: 'lower_abdomen',
            label_localized: loc(language, {
              en: 'Lower abdomen',
              hi: 'पेट के निचले हिस्से में',
              mr: 'पोटाच्या खालच्या भागात',
            }),
          },
          {
            label: 'Back / Spine',
            value: 'back',
            label_localized: loc(language, {
              en: 'Back / Spine',
              hi: 'कमर या पीठ में',
              mr: 'कंबर किंवा पाठीमध्ये',
            }),
          },
          {
            label: 'Head / Forehead',
            value: 'head',
            label_localized: loc(language, {
              en: 'Head / Forehead',
              hi: 'सिर या माथे में',
              mr: 'डोके किंवा कपाळात',
            }),
          },
          {
            label: 'Joints / Legs',
            value: 'joints',
            label_localized: loc(language, {
              en: 'Joints / Knees / Legs',
              hi: 'घुटनों / जोड़ों में',
              mr: 'गुडघे / सांध्यांमध्ये',
            }),
          },
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
        question_localized: loc(language, {
          en: 'When did this pain start?',
          hi: 'यह दर्द कब से शुरू हुआ है?',
          mr: 'हे दुखणे कधीपासून सुरू झाले आहे?',
        }),
        field_key: 'socrates_onset',
        options: [
          {
            label: 'Today (Sudden)',
            value: 'today_sudden',
            label_localized: loc(language, {
              en: 'Today (Sudden onset)',
              hi: 'आज ही अचानक शुरू हुआ',
              mr: 'आजच अचानक सुरू झाले',
            }),
          },
          {
            label: '2-3 days ago',
            value: '2_3_days',
            label_localized: loc(language, {
              en: '2-3 days ago',
              hi: '२-३ दिनों से',
              mr: '२-३ दिवसांपासून',
            }),
          },
          {
            label: 'Over a week ago',
            value: '1_week',
            label_localized: loc(language, {
              en: 'Over a week ago',
              hi: '१ हफ्ते से अधिक',
              mr: '१ आठवड्यापेक्षा जास्त',
            }),
          },
          {
            label: 'Long-standing (months)',
            value: 'chronic',
            label_localized: loc(language, {
              en: 'Long-standing (months)',
              hi: 'काफी महीनों से',
              mr: 'काही महिन्यांपासून (दीर्घकालीन)',
            }),
          },
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
        question_localized: loc(language, {
          en: 'What does the pain feel like?',
          hi: 'दर्द किस प्रकार का महसूस होता है?',
          mr: 'वेदना कशा प्रकारच्या जाणवतात?',
        }),
        field_key: 'socrates_character',
        options: [
          {
            label: 'Sharp / Stabbing',
            value: 'sharp',
            label_localized: loc(language, {
              en: 'Sharp / Stabbing',
              hi: 'तीखा या चुभने जैसा',
              mr: 'तीव्र किंवा टोचल्यासारखी कळ',
            }),
          },
          {
            label: 'Dull / Heavy',
            value: 'dull',
            label_localized: loc(language, {
              en: 'Dull / Heavy',
              hi: 'हल्का-हल्का भारी दर्द',
              mr: 'मंद किंवा जड वेदना',
            }),
          },
          {
            label: 'Burning',
            value: 'burning',
            label_localized: loc(language, {
              en: 'Burning sensation',
              hi: 'जलन जैसा दर्द',
              mr: 'जळजळ होणारी वेदना',
            }),
          },
          {
            label: 'Cramping / Colicky',
            value: 'cramping',
            label_localized: loc(language, {
              en: 'Cramping / Colicky',
              hi: 'मरोड़ या ऐंठन जैसा',
              mr: 'मुरडा येणे किंवा पेटके',
            }),
          },
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
        question_localized: loc(language, {
          en: 'How severe is the pain right now?',
          hi: 'अभी दर्द कितना तेज़ है?',
          mr: 'आता वेदना किती तीव्र आहेत?',
        }),
        field_key: 'socrates_severity',
        options: [
          {
            label: 'Mild (tolerable)',
            value: 'mild',
            label_localized: loc(language, {
              en: 'Mild (tolerable)',
              hi: 'हल्का (सहन करने योग्य)',
              mr: 'कमी (सहन होण्यासारखी)',
            }),
          },
          {
            label: 'Moderate',
            value: 'moderate',
            label_localized: loc(language, {
              en: 'Moderate (disturbing)',
              hi: 'मध्यम (काफी परेशानी)',
              mr: 'मध्यम (त्रासदायक)',
            }),
          },
          {
            label: 'Severe (unbearable)',
            value: 'severe',
            label_localized: loc(language, {
              en: 'Severe (unbearable)',
              hi: 'बहुत तेज़ (असहनीय)',
              mr: 'अतिशय तीव्र (असह्य)',
            }),
          },
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
        question_localized: loc(language, {
          en: 'How many days have you had these symptoms?',
          hi: 'यह लक्षण आपको कितने दिनों से हैं?',
          mr: 'ही लक्षणे तुम्हाला किती दिवसांपासून आहेत?',
        }),
        field_key: 'hpi_duration',
        options: [
          {
            label: '1-2 days',
            value: '1_2_days',
            label_localized: loc(language, {
              en: '1-2 days',
              hi: '१-२ दिन से',
              mr: '१-२ दिवसांपासून',
            }),
          },
          {
            label: '3-5 days',
            value: '3_5_days',
            label_localized: loc(language, {
              en: '3-5 days',
              hi: '३-५ दिन से',
              mr: '३-५ दिवसांपासून',
            }),
          },
          {
            label: 'About a week',
            value: '1_week',
            label_localized: loc(language, {
              en: 'About a week',
              hi: 'लगभग १ हफ्ते से',
              mr: 'सुमारे १ आठवड्यापासून',
            }),
          },
          {
            label: 'Over 2 weeks',
            value: 'more_2_weeks',
            label_localized: loc(language, {
              en: 'Over 2 weeks',
              hi: '२ हफ्ते से अधिक',
              mr: '२ आठवड्यांपेक्षा जास्त',
            }),
          },
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
        question_localized: loc(language, {
          en: 'Is the condition getting worse or staying the same?',
          hi: 'क्या तकलीफ़ बढ़ रही है या वैसी ही है?',
          mr: 'त्रास वाढत चालला आहे की तसाच आहे?',
        }),
        field_key: 'hpi_progression',
        options: [
          {
            label: 'Getting worse',
            value: 'worsening',
            label_localized: loc(language, {
              en: 'Getting worse',
              hi: 'दिन-ब-दिन बढ़ रही है',
              mr: 'दिवसेंदिवस वाढत आहे',
            }),
          },
          {
            label: 'Staying the same',
            value: 'same',
            label_localized: loc(language, {
              en: 'Staying the same',
              hi: 'वैसी की वैसी ही है',
              mr: 'आहे तसाच आहे',
            }),
          },
          {
            label: 'Comes and goes',
            value: 'intermittent',
            label_localized: loc(language, {
              en: 'Comes and goes',
              hi: 'आती-जाती रहती है',
              mr: 'कमी-जास्त होतो',
            }),
          },
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
      question_localized: loc(language, {
        en: 'Do you have any prior medical conditions (like BP, Sugar, or Asthma)?',
        hi: 'क्या आपको बीपी, शुगर (मधुमेह) या दमा जैसी कोई पुरानी बीमारी है?',
        mr: 'तुम्हाला आधीपासून रक्तदाब (BP), मधुमेह (Sugar) किंवा दमा असा कोणताही जुना आजार आहे का?',
      }),
      field_key: 'past_medical_history',
      options: [
        {
          label: 'Diabetes (Sugar)',
          value: 'diabetes',
          label_localized: loc(language, {
            en: 'Diabetes (Sugar)',
            hi: 'शुगर / मधुमेह (Diabetes)',
            mr: 'मधुमेह / साखर (Diabetes)',
          }),
        },
        {
          label: 'High BP',
          value: 'hypertension',
          label_localized: loc(language, {
            en: 'High Blood Pressure',
            hi: 'उच्च रक्तचाप (High BP)',
            mr: 'उच्च रक्तदाब (High BP)',
          }),
        },
        {
          label: 'Both Sugar & BP',
          value: 'both',
          label_localized: loc(language, {
            en: 'Both Diabetes & High BP',
            hi: 'शुगर और बीपी दोनों',
            mr: 'मधुमेह आणि बीपी दोन्ही',
          }),
        },
        {
          label: 'Asthma / Breathing',
          value: 'asthma',
          label_localized: loc(language, {
            en: 'Asthma / Breathing issue',
            hi: 'दमा / अस्थमा',
            mr: 'दमा / श्वसनाचा त्रास (Asthma)',
          }),
        },
        {
          label: 'No prior conditions',
          value: 'none',
          label_localized: loc(language, {
            en: 'No prior medical conditions',
            hi: 'कोई पुरानी बीमारी नहीं',
            mr: 'कोणताही जुना आजार नाही',
          }),
        },
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
      question_localized: loc(language, {
        en: 'Are you taking any regular medications or do you have any allergies?',
        hi: 'क्या आप कोई नियमित दवाई लेते हैं, या किसी दवा से एलर्जी है?',
        mr: 'तुम्ही रोज कोणती औषधे घेता का, किंवा कोणत्याही औषधाची ॲलर्जी आहे का?',
      }),
      field_key: 'regular_meds',
      options: [
        {
          label: 'Taking daily medicines',
          value: 'daily_meds',
          label_localized: loc(language, {
            en: 'Taking daily medicines',
            hi: 'हाँ, नियमित दवाई ले रहा हूँ',
            mr: 'होय, नियमित औषधे सुरू आहेत',
          }),
        },
        {
          label: 'Have medicine allergies',
          value: 'has_allergy',
          label_localized: loc(language, {
            en: 'Have medicine allergies',
            hi: 'हाँ, दवाइयों से एलर्जी है',
            mr: 'होय, औषधांची ॲलर्जी आहे',
          }),
        },
        {
          label: 'Took painkiller today',
          value: 'took_painkiller',
          label_localized: loc(language, {
            en: 'Took painkiller today',
            hi: 'आज ही दर्द की गोली ली थी',
            mr: 'आजच वेदनाशामक गोळी घेतली होती',
          }),
        },
        {
          label: 'No regular medicines',
          value: 'none',
          label_localized: loc(language, {
            en: 'No regular medicines',
            hi: 'कोई नियमित दवा नहीं',
            mr: 'कोणतीही नियमित औषधे नाहीत',
          }),
        },
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
    question_localized: loc(language, {
      en: 'Thank you. We are ready to scan your old prescriptions and reports.',
      hi: 'धन्यवाद। अब हम आपके पुराने पर्चे और जाँच रिपोर्ट स्कैन करने के लिए तैयार हैं।',
      mr: 'धन्यवाद. आता आम्ही तुमचे जुने वैद्यकीय कागदपत्रे आणि अहवाल स्कॅन करण्यास तयार आहोत.',
    }),
    field_key: 'ready_for_scan',
    options: [
      {
        label: 'Proceed to Scanner',
        value: 'proceed_scan',
        label_localized: loc(language, {
          en: 'Proceed to Scanner ➔',
          hi: 'स्कैनर पर आगे बढ़ें ➔',
          mr: 'स्कॅनरवर पुढे जा ➔',
        }),
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
