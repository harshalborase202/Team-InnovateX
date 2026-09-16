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

function locText(
  lang: SupportedLanguage,
  map: Partial<Record<SupportedLanguage, string>> & { en: string }
): string {
  return map[lang] || map['mr'] || map['hi'] || map['en']
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
      question_localized: locText(language, {
        mr: 'आणीबाणीची लक्षणे आढळली आहेत. कृपया त्वरित ओपीडी आरोग्य कर्मचाऱ्यांशी संपर्क साधा.',
        hi: 'आपातकालीन लक्षण पाए गए हैं। कृपया तुरंत ओपीडी स्वास्थ्य कर्मी को सूचित करें।',
        en: 'Immediate Clinical Alert: Red flag emergency symptoms detected. Please notify staff immediately.',
        ta: 'அவசர மருத்துவ அறிகுறி கண்டறியப்பட்டுள்ளது. உடனடியாக பணியாளரிடம் தெரிவிக்கவும்.',
        bn: 'জরুরি স্বাস্থ্য লক্ষণ সনাক্ত করা হয়েছে। অবিলম্বে কর্মীদের জানান।',
        te: 'అత్యవసర ఆరోగ్య లక్షణాలు గుర్తించబడ్డాయి. వెంటనే సిబ్బందికి తెలియజేయండి.',
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
        question_localized: locText(language, {
          mr: 'धन्यवाद! आपली प्रकृती, अग्नी आणि आरोग्य माहिती यशस्वीरीत्या नोंदवली गेली आहे.',
          hi: 'धन्यवाद। आपकी प्रकृति, अग्नि, कोष्ठ व स्वास्थ्य विवरण सफलतापूर्वक दर्ज कर लिया गया है।',
          en: 'Thank you. Your AYUSH clinical profile and health history are recorded.',
          ta: 'நன்றி. உங்கள் ஆயுஷ் சுகாதார விவரங்கள் பதிவு செய்யப்பட்டன.',
          bn: 'ধন্যবাদ। আপনার আয়ুষ স্বাস্থ্য তথ্য সফলভাবে রেকর্ড করা হয়েছে।',
          te: 'ధన్యవాదాలు. మీ ఆయుష్ ఆరోగ్య వివరాలు విజయవంతంగా నమోదు చేయబడ్డాయి.',
        }),
        field_key: 'interview_completed',
        options: [
          {
            label: 'Proceed to Report Scanning',
            value: 'proceed',
            label_localized: locText(language, {
              mr: 'कागदपत्र स्कॅनिंगसाठी पुढे जा ➔',
              hi: 'दस्तावेज़ स्कैनिंग के लिए आगे बढ़ें ➔',
              en: 'Proceed to Report Scanning ➔',
              ta: 'ஆவணங்கள் ஸ்கேன் செய்ய தொடரவும் ➔',
              bn: 'রিপোর্ট স্ক্যান করতে এগিয়ে যান ➔',
              te: 'పత్రాల స్కాన్ చేయడానికి కొనసాగండి ➔',
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
        question_localized: locText(language, {
          mr: 'आज आपल्याला मुख्यत्वे काय त्रास किंवा आरोग्य समस्या आहे?',
          hi: 'आज आपको क्या मुख्य स्वास्थ्य तकलीफ़ या समस्या है?',
          en: 'What is your primary health complaint today?',
          ta: 'இன்று உங்களுக்கு என்ன முக்கிய சுகாதார பிரச்சினை உள்ளது?',
          bn: 'আজ আপনার প্রধান স্বাস্থ্য সমস্যা কী?',
          te: 'ఈ రోజు మీ ప్రధాన ఆరోగ్య సమస్య ఏమిటి?',
        }),
        field_key: 'chief_complaint',
        options: [
          {
            label: 'Indigestion / Gas / Acidity',
            value: 'digestion',
            label_localized: locText(language, {
              mr: '🔥 अपचन, गॅस किंवा ॲसिडिटी (Digestion)',
              hi: '🔥 गैस, बदहजमी या एसिडिटी (Digestion)',
              en: '🔥 Indigestion / Gas / Acidity',
              ta: '🔥 செரிமானமின்மை / அசிடிட்டி',
              bn: '🔥 গ্যাস্ট্রিক / বদহজম',
              te: '🔥 అజీర్ణం / ఎసిడిటీ',
            }),
          },
          {
            label: 'Joint Pain / Vata Vyadhi',
            value: 'joint_pain',
            label_localized: locText(language, {
              mr: '⚡ सांधेदुखी किंवा अंगदुखी (Joint Pain)',
              hi: '⚡ जोड़ों या बदन का दर्द (Joint Pain)',
              en: '⚡ Joint Pain / Vata Vyadhi',
              ta: '⚡ மூட்டு வலி / உடல் வலி',
              bn: '⚡ জোড়ায় ব্যথা / শরীরে ব্যথা',
              te: '⚡ కీళ్ల నొప్పులు / శరీర నొప్పులు',
            }),
          },
          {
            label: 'Cough / Cold / Respiratory',
            value: 'cough',
            label_localized: locText(language, {
              mr: '🗣️ खोकला, कफ किंवा दमा (Respiratory)',
              hi: '🗣️ खाँसी, बलगम या दमा (Respiratory)',
              en: '🗣️ Cough / Cold / Respiratory',
              ta: '🗣️ இருமல் / சளி',
              bn: '🗣️ কাশি / শ্বাসকষ্ট',
              te: '🗣️ దగ్గు / ఆయాసం',
            }),
          },
          {
            label: 'Skin Conditions / Rashes',
            value: 'skin',
            label_localized: locText(language, {
              mr: '🩹 त्वचेचे आजार / खाज (Skin)',
              hi: '🩹 त्वचा रोग / खुजली / दाद (Skin)',
              en: '🩹 Skin Conditions / Rashes',
              ta: '🩹 தோலால் ஏற்படும் பிரச்சினைகள்',
              bn: '🩹 ত্বকের সমস্যা / চুলকানি',
              te: '🩹 చర్మ సమస్యలు',
            }),
          },
          {
            label: 'Weakness / Low Energy',
            value: 'fatigue',
            label_localized: locText(language, {
              mr: '💤 अशक्तपणा किंवा थकवा (Fatigue)',
              hi: '💤 कमज़ोरी या थकान (Fatigue)',
              en: '💤 Weakness / Low Energy',
              ta: '💤 சோர்வு / பலவீனம்',
              bn: '💤 দুর্বলতা / ক্লান্তি',
              te: '💤 నీరసం / అలసట',
            }),
          },
          {
            label: 'Other',
            value: 'other',
            label_localized: locText(language, {
              mr: '❓ इतर समस्या (Other)',
              hi: '❓ अन्य समस्या (Other)',
              en: '❓ Other',
              ta: '❓ மற்றவை (Other)',
              bn: '❓ অন্যান্য (Other)',
              te: '❓ ఇతర (Other)',
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
        question_localized: locText(language, {
          mr: 'प्रकृती (शारीरिक बांधा): आपली नैसर्गिक शारीरिक रचना व सवयी कशा आहेत?',
          hi: 'प्रकृति (शारीरिक गठन): आपकी स्वाभाविक शारीरिक बनावट और मौसम सहनशीलता कैसी है?',
          en: 'Prakriti: What is your natural body build, appetite, and weather tolerance?',
        }),
        field_key: 'ayush_prakriti',
        options: [
          {
            label: 'Vata: Lean build, easily feels cold, active/restless mind',
            value: 'vata',
            label_localized: locText(language, {
              mr: '💨 वात: बारीक शरीर, लवकर थंडी वाजणे, चंचल स्वभाव',
              hi: '💨 वात: दुबला शरीर, जल्दी ठंड लगना, चंचल स्वभाव',
              en: '💨 Vata: Lean build, easily feels cold, active mind',
            }),
          },
          {
            label: 'Pitta: Medium build, feels heat/sweat quickly, sharp appetite',
            value: 'pitta',
            label_localized: locText(language, {
              mr: '🔥 पित्त: मध्यम शरीर, जास्त उकाडा/घाम, तीव्र भूक',
              hi: '🔥 पित्त: मध्यम शरीर, अधिक गर्मी/पसीना, तेज़ भूख',
              en: '🔥 Pitta: Medium build, feels heat quickly, sharp appetite',
            }),
          },
          {
            label: 'Kapha: Solid/heavy build, calm nature, sound sleep',
            value: 'kapha',
            label_localized: locText(language, {
              mr: '💧 कफ: दणकट/भारी शरीर, शांत स्वभाव, शांत झोप',
              hi: '💧 कफ: मजबूत/भारी शरीर, शांत स्वभाव, गहरी नींद',
              en: '💧 Kapha: Solid build, calm nature, sound sleep',
            }),
          },
          {
            label: 'Mixed / Balanced: Combination of doshas',
            value: 'mixed',
            label_localized: locText(language, {
              mr: '⚖️ मिश्रित: एकत्र लक्षणे (Combination)',
              hi: '⚖️ मिश्रित: मिले-जुले लक्षण (Combination)',
              en: '⚖️ Mixed / Combination of doshas',
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
        question_localized: locText(language, {
          mr: 'विकृती (सध्याचा असंतुलन): सध्या आपल्याला कोणत्या प्रकारचा त्रास जाणवत आहे?',
          hi: 'विकृति (वर्तमान असंतुलन): अभी आपको मुख्य रूप से किस प्रकार की तकलीफ़ महसूस हो रही है?',
          en: 'Vikriti: Which doshic imbalance feels most disturbed currently?',
        }),
        field_key: 'ayush_vikriti',
        options: [
          {
            label: 'Vata imbalance: Joint aches, gas, constipation, restlessness',
            value: 'vata_imbalance',
            label_localized: locText(language, {
              mr: '💨 वात असंतुलन: सांधेदुखी, गॅस, अपुरी झोप किंवा कोरडेपणा',
              hi: '💨 वात असंतुलन: जोड़ों में दर्द, गैस, अनिद्रा या रूखापन',
              en: '💨 Vata imbalance: Joint aches, gas, restlessness',
            }),
          },
          {
            label: 'Pitta imbalance: Acidity, burning sensations, skin heat, mouth ulcers',
            value: 'pitta_imbalance',
            label_localized: locText(language, {
              mr: '🔥 पित्त असंतुलन: ॲसिडिटी, अंगाची आग, तोंडात छाले',
              hi: '🔥 पित्त असंतुलन: एसिडिटी, जलन, मुँह में छाले या गुस्सा',
              en: '🔥 Pitta imbalance: Acidity, burning sensations, skin heat',
            }),
          },
          {
            label: 'Kapha imbalance: Heaviness in body, excess phlegm, lethargy, weight gain',
            value: 'kapha_imbalance',
            label_localized: locText(language, {
              mr: '💧 कफ असंतुलन: अंगात जडपणा, कफ, सुस्ती',
              hi: '💧 कफ असंतुलन: भारीपन, बलगम, अत्यधिक सुस्ती व कफ',
              en: '💧 Kapha imbalance: Heaviness in body, excess phlegm, lethargy',
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
        question_localized: locText(language, {
          mr: 'जठराग्नी (पचनशक्ती): आपली भूक आणि अन्न पचनाची शक्ती कशी आहे?',
          hi: 'जठराग्नि (पाचन शक्ति): आपकी भूख और भोजन पचाने की शक्ति कैसी है?',
          en: 'Agni: How is your daily appetite and digestive strength?',
        }),
        field_key: 'ayush_agni',
        options: [
          {
            label: 'Samagni: Normal appetite, food digests easily on time',
            value: 'samagni',
            label_localized: locText(language, {
              mr: '🟢 समाग्नी: वेळेवर नियमित भूक, अन्न सहज पचते',
              hi: '🟢 समाग्नि: नियमित भूख, खाना आसानी से पचता है',
              en: '🟢 Samagni: Normal appetite, food digests easily',
            }),
          },
          {
            label: 'Tikshnagni: Very intense hunger, burning/acidity if delayed',
            value: 'tikshnagni',
            label_localized: locText(language, {
              mr: '🔴 तीक्ष्णाग्नी: खूप तीव्र भूक, वेळेवर न खाल्ल्यास ॲसिडिटी',
              hi: '🔴 तीक्ष्णाग्नि: बहुत तेज़ भूख, न खाने पर एसिडिटी व जलन',
              en: '🔴 Tikshnagni: Very intense hunger, burning if delayed',
            }),
          },
          {
            label: 'Mandagni: Poor appetite, feels heavy/bloated after eating',
            value: 'mandagni',
            label_localized: locText(language, {
              mr: '🟡 मंदाग्नी: भूक फार कमी, खाल्ल्यावर पोट जड होणे',
              hi: '🟡 मन्दाग्नि: भूख बहुत कम, खाने के बाद भारीपन व फूला पेट',
              en: '🟡 Mandagni: Poor appetite, feels heavy after eating',
            }),
          },
          {
            label: 'Vishamagni: Irregular appetite, unpredictable digestion',
            value: 'vishamagni',
            label_localized: locText(language, {
              mr: '🔵 विषमाग्नी: कधी खूप भूक, तर कधी अजिबात नाही',
              hi: '🔵 विषमाग्नि: कभी बहुत भूख, कभी बिल्कुल नहीं',
              en: '🔵 Vishamagni: Irregular, unpredictable digestion',
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
        question_localized: locText(language, {
          mr: 'कोष्ठ (पोट साफ होणे): आपले पोट साफ होण्याची पद्धत कशी आहे?',
          hi: 'कोष्ठ (पेट साफ होने की प्रकृति): आपका शौच / पेट साफ होने की आदत कैसी है?',
          en: 'Koshtha: How is your bowel evacuation nature?',
        }),
        field_key: 'ayush_koshtha',
        options: [
          {
            label: 'Mrudu Koshtha: Soft, easy evacuation even with warm milk',
            value: 'mrudu',
            label_localized: locText(language, {
              mr: '💧 मृदू कोष्ठ: अगदी सहज व मऊ पोट साफ होते',
              hi: '💧 मृदु कोष्ठ: आसानी से/दूध से भी तुरंत पेट साफ होता है',
              en: '💧 Mrudu Koshtha: Soft, easy evacuation',
            }),
          },
          {
            label: 'Madhyama Koshtha: Normal, comfortable daily evacuation',
            value: 'madhyama',
            label_localized: locText(language, {
              mr: '⚖️ मध्यम कोष्ठ: दिवसातून १-२ वेळा सामान्यपणे साफ होते',
              hi: '⚖️ मध्यम कोष्ठ: दिन में १-२ बार सामान्य रूप से साफ होता है',
              en: '⚖️ Madhyama Koshtha: Normal daily evacuation',
            }),
          },
          {
            label: 'Krura Koshtha: Hard, dry stool, tendency towards constipation',
            value: 'krura',
            label_localized: locText(language, {
              mr: '🪨 क्रूर कोष्ठ: बद्धकोष्ठता (कब्ज), मल कडक होणे',
              hi: '🪨 क्रूर कोष्ठ: कब्ज रहता है, मल कड़ा होता है',
              en: '🪨 Krura Koshtha: Hard stool, constipation tendency',
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
        question_localized: locText(language, {
          mr: 'आहार-विहार (दिनचर्या): आपला दैनंदिन आहार आणि सवयी कशा आहेत?',
          hi: 'आहार-विहार (दिनचर्या): आपकी दैनिक खानपान और सोने-जागने की मुख्य आदत कैसी है?',
          en: 'Ahara-Vihara: What describes your daily diet and lifestyle habits?',
        }),
        field_key: 'ayush_ahara_vihara',
        options: [
          {
            label: 'Satvik / Light home food, regular sleep routine',
            value: 'satvik_regular',
            label_localized: locText(language, {
              mr: '🥗 साधा घरगुती आहार, वेळेवर झोप व उठणे',
              hi: '🥗 सादा घर का भोजन, समय पर सोना और जागना',
              en: '🥗 Light home food, regular sleep routine',
            }),
          },
          {
            label: 'Spicy / oily / heavy food, irregular meal timings',
            value: 'spicy_irregular',
            label_localized: locText(language, {
              mr: '🌶️ तिखट, तेलकट किंवा अवेळी जेवण',
              hi: '🌶️ तीखा, तला-भुना या अनियमित समय पर भोजन',
              en: '🌶️ Spicy / oily food, irregular meal timings',
            }),
          },
          {
            label: 'Late night sleeping, high stress or sedentary routine',
            value: 'late_nights_stress',
            label_localized: locText(language, {
              mr: '⏰ उशिरा झोपणे, ताणतणाव व शारीरिक कष्टाचा अभाव',
              hi: '⏰ देर रात तक जागना, तनाव व शारीरिक श्रम की कमी',
              en: '⏰ Late night sleeping, high stress routine',
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
  const isPain = chief.includes('pain') || chief.includes('दर्द') || chief.includes('दुख') || chief.includes('stomach') || chief.includes('body')
  const total = 7 // Hard cap: exactly 7 questions max

  // Completion check
  if (turnCount >= total) {
    return {
      question: 'Thank you. We have gathered sufficient health history for your consultation.',
      question_localized: locText(language, {
        mr: 'धन्यवाद! डॉक्टरांच्या सल्ल्यासाठी पुरेशी माहिती नोंदवली गेली आहे.',
        hi: 'धन्यवाद। डॉक्टर के लिए पर्याप्त स्वास्थ्य जानकारी एकत्र कर ली गई है।',
        en: 'Thank you. We have gathered sufficient health history for your consultation.',
        ta: 'நன்றி. உங்கள் மருத்துவ ஆலோசனைக்கான தகவல்கள் சேகரிக்கப்பட்டன.',
        bn: 'ধন্যবাদ। ডাক্তারের পরামর্শের জন্য প্রয়োজনীয় তথ্য সংগ্রহ করা হয়েছে।',
        te: 'ధన్యవాదాలు. మీ వైద్య సంప్రదింపులకు అవసరమైన వివరాలు సేకరించబడ్డాయి.',
      }),
      field_key: 'interview_completed',
      options: [
        {
          label: 'Proceed to Report Scanning',
          value: 'proceed',
          label_localized: locText(language, {
            mr: 'कागदपत्र स्कॅनिंगसाठी पुढे जा ➔',
            hi: 'दस्तावेज़ स्कैनिंग के लिए आगे बढ़ें ➔',
            en: 'Proceed to Report Scanning ➔',
            ta: 'ஆவணங்கள் ஸ்கேன் செய்ய தொடரவும் ➔',
            bn: 'রিপোর্ট স্ক্যান করতে এগিয়ে যান ➔',
            te: 'పత్రాల స్కాన్ చేయడానికి కొనసాగండి ➔',
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
      question_localized: locText(language, {
        mr: 'आज आपल्याला नक्की काय त्रास किंवा आरोग्य समस्या आहे?',
        hi: 'आज आपको क्या मुख्य समस्या या तकलीफ़ है?',
        en: 'What is bothering you today?',
        ta: 'இன்று உங்களுக்கு என்ன பிரச்சினை உள்ளது?',
        bn: 'আজ আপনার কী সমস্যা হচ্ছে?',
        te: 'ఈ రోజు మీకు ఉన్న సమస్య ఏమిటి?',
      }),
      field_key: 'chief_complaint',
      options: [
        {
          label: 'Fever',
          value: 'fever',
          label_localized: locText(language, {
            mr: '🌡️ ताप (Fever)',
            hi: '🌡️ बुखार (Fever)',
            en: '🌡️ Fever',
            ta: '🌡️ காய்ச்சல் (Fever)',
            bn: '🌡️ জ্বর (Fever)',
            te: '🌡️ జ్వరం (Fever)',
          }),
        },
        {
          label: 'Cough / Cold',
          value: 'cough',
          label_localized: locText(language, {
            mr: '🗣️ खोकला / सर्दी (Cough)',
            hi: '🗣️ खाँसी / ज़ुकाम (Cough)',
            en: '🗣️ Cough / Cold',
            ta: '🗣️ இருமல் / சளி (Cough)',
            bn: '🗣️ কাশি / সর্দি (Cough)',
            te: '🗣️ దగ్గు / జలుబు (Cough)',
          }),
        },
        {
          label: 'Stomach Pain',
          value: 'stomach_pain',
          label_localized: locText(language, {
            mr: '🤢 पोटदुखी (Stomach Pain)',
            hi: '🤢 पेट दर्द (Stomach Pain)',
            en: '🤢 Stomach Pain',
            ta: '🤢 வயிற்று வலி (Stomach Pain)',
            bn: '🤢 পেটে ব্যথা (Stomach Pain)',
            te: '🤢 కడుపు నొప్పి (Stomach Pain)',
          }),
        },
        {
          label: 'Body / Joint Pain',
          value: 'body_pain',
          label_localized: locText(language, {
            mr: '⚡ अंगदुखी / सांधेदुखी (Body Pain)',
            hi: '⚡ बदन / जोड़ों का दर्द (Body Pain)',
            en: '⚡ Body / Joint Pain',
            ta: '⚡ உடல் / மூட்டு வலி (Body Pain)',
            bn: '⚡ শরীরে ব্যথা / জোড়ায় ব্যথা (Body Pain)',
            te: '⚡ శరీర నొప్పులు / కీళ్ల నొప్పులు (Body Pain)',
          }),
        },
        {
          label: "Women's Health",
          value: 'womens_health',
          label_localized: locText(language, {
            mr: '🌸 महिलांचे आरोग्य (Women\'s Health)',
            hi: '🌸 महिला स्वास्थ्य (Women\'s Health)',
            en: '🌸 Women\'s Health',
            ta: '🌸 பெண்கள் சுகாதாரம்',
            bn: '🌸 নারীদের স্বাস্থ্য',
            te: '🌸 మహిళల ఆరోగ్యం',
          }),
        },
        {
          label: 'Skin Problem',
          value: 'skin',
          label_localized: locText(language, {
            mr: '🩹 त्वचेचे विकार / खाज (Skin)',
            hi: '🩹 त्वचा / दाद-खुजली (Skin)',
            en: '🩹 Skin Problem',
            ta: '🩹 தோல் பிரச்சினைகள்',
            bn: '🩹 ত্বকের সমস্যা',
            te: '🩹 చర్మ సమస్యలు',
          }),
        },
        {
          label: 'Chest pain & breathlessness',
          value: 'chest_pain_severe',
          label_localized: locText(language, {
            mr: '⚠️ छातीत दुखणे व धाप लागणे (Chest Pain)',
            hi: '⚠️ सीने में दर्द और सांस फूलना (Chest Pain)',
            en: '⚠️ Chest pain & breathlessness',
            ta: '⚠️ நெஞ்சு வலி / மூச்சுத்திணறல்',
            bn: '⚠️ বুকে ব্যথা ও শ্বাসকষ্ট',
            te: '⚠️ ఛాతీ నొప్పి & ఆయాసం',
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
        question_localized: locText(language, {
          mr: 'शरीरात नक्की कोणत्या ठिकाणी दुखत आहे?',
          hi: 'दर्द शरीर में ठीक किस जगह पर हो रहा है?',
          en: 'Where exactly is the pain located?',
        }),
        field_key: 'socrates_site',
        options: [
          {
            label: 'Upper abdomen',
            value: 'upper_abdomen',
            label_localized: locText(language, {
              mr: 'पोटाच्या वरच्या भागात',
              hi: 'पेट के ऊपरी हिस्से में',
              en: 'Upper abdomen',
            }),
          },
          {
            label: 'Lower abdomen',
            value: 'lower_abdomen',
            label_localized: locText(language, {
              mr: 'पोटाच्या खालच्या भागात',
              hi: 'पेट के निचले हिस्से में',
              en: 'Lower abdomen',
            }),
          },
          {
            label: 'Back / Spine',
            value: 'back',
            label_localized: locText(language, {
              mr: 'पाठ किंवा कंबरेत',
              hi: 'कमर या पीठ में',
              en: 'Back / Spine',
            }),
          },
          {
            label: 'Head / Forehead',
            value: 'head',
            label_localized: locText(language, {
              mr: 'डोक्यात किंवा कपळावर',
              hi: 'सिर या माथे में',
              en: 'Head / Forehead',
            }),
          },
          {
            label: 'Joints / Legs',
            value: 'joints',
            label_localized: locText(language, {
              mr: 'गुडघ्यात किंवा सांध्यांमध्ये',
              hi: 'घुटनों / जोड़ों में',
              en: 'Joints / Legs',
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
        question_localized: locText(language, {
          mr: 'हा त्रास कधीपासून सुरू झाला आहे?',
          hi: 'यह दर्द कब से शुरू हुआ है?',
          en: 'When did this pain start?',
        }),
        field_key: 'socrates_onset',
        options: [
          {
            label: 'Today (Sudden)',
            value: 'today_sudden',
            label_localized: locText(language, {
              mr: 'आजच अचानक सुरू झाला',
              hi: 'आज ही अचानक शुरू हुआ',
              en: 'Today (Sudden)',
            }),
          },
          {
            label: '2-3 days ago',
            value: '2_3_days',
            label_localized: locText(language, {
              mr: '२-३ दिवसांपासून',
              hi: '२-३ दिनों से',
              en: '2-3 days ago',
            }),
          },
          {
            label: 'Over a week ago',
            value: '1_week',
            label_localized: locText(language, {
              mr: '१ आठवड्यापेक्षा जास्त',
              hi: '१ हफ्ते से अधिक',
              en: 'Over a week ago',
            }),
          },
          {
            label: 'Long-standing (months)',
            value: 'chronic',
            label_localized: locText(language, {
              mr: 'अनेक महिन्यांपासून',
              hi: 'काफी महीनों से',
              en: 'Long-standing (months)',
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
        question_localized: locText(language, {
          mr: 'दुखणे नेमके कसे जाणवते?',
          hi: 'दर्द किस प्रकार का महसूस होता है?',
          en: 'What does the pain feel like?',
        }),
        field_key: 'socrates_character',
        options: [
          {
            label: 'Sharp / Stabbing',
            value: 'sharp',
            label_localized: locText(language, {
              mr: 'तीव्र किंवा टोचल्यासारखे',
              hi: 'तीखा या चुभने जैसा',
              en: 'Sharp / Stabbing',
            }),
          },
          {
            label: 'Dull / Heavy',
            value: 'dull',
            label_localized: locText(language, {
              mr: 'हळूवार जड होणारे दुखणे',
              hi: 'हल्का-हल्का भारी दर्द',
              en: 'Dull / Heavy',
            }),
          },
          {
            label: 'Burning',
            value: 'burning',
            label_localized: locText(language, {
              mr: 'आग किंवा जळजळ झाल्यासारखे',
              hi: 'जलन जैसा दर्द',
              en: 'Burning',
            }),
          },
          {
            label: 'Cramping / Colicky',
            value: 'cramping',
            label_localized: locText(language, {
              mr: 'पोटातील पिळल्यासारखे / मरोड',
              hi: 'मरोड़ या ऐंठन जैसा',
              en: 'Cramping / Colicky',
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
        question_localized: locText(language, {
          mr: 'सध्या दुखणे किती तीव्र आहे?',
          hi: 'अभी दर्द कितना तेज़ है?',
          en: 'How severe is the pain right now?',
        }),
        field_key: 'socrates_severity',
        options: [
          {
            label: 'Mild (tolerable)',
            value: 'mild',
            label_localized: locText(language, {
              mr: 'सौम्य (सहन होण्याजोगे)',
              hi: 'हल्का (सहन करने योग्य)',
              en: 'Mild (tolerable)',
            }),
          },
          {
            label: 'Moderate',
            value: 'moderate',
            label_localized: locText(language, {
              mr: 'मध्यम (त्रासदायक)',
              hi: 'मध्यम (काफी परेशानी)',
              en: 'Moderate',
            }),
          },
          {
            label: 'Severe (unbearable)',
            value: 'severe',
            label_localized: locText(language, {
              mr: 'खूप तीव्र (असह्य)',
              hi: 'बहुत तेज़ (असहनीय)',
              en: 'Severe (unbearable)',
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
        question_localized: locText(language, {
          mr: 'हे लक्षण आपल्याला किती दिवसांपासून आहे?',
          hi: 'यह लक्षण आपको कितने दिनों से हैं?',
          en: 'How many days have you had these symptoms?',
        }),
        field_key: 'hpi_duration',
        options: [
          {
            label: '1-2 days',
            value: '1_2_days',
            label_localized: locText(language, {
              mr: '१-२ दिवसांपासून',
              hi: '१-२ दिन से',
              en: '1-2 days',
            }),
          },
          {
            label: '3-5 days',
            value: '3_5_days',
            label_localized: locText(language, {
              mr: '३-५ दिवसांपासून',
              hi: '३-५ दिन से',
              en: '3-5 days',
            }),
          },
          {
            label: 'About a week',
            value: '1_week',
            label_localized: locText(language, {
              mr: 'सुमारे १ आठवड्यापासून',
              hi: 'लगभग १ हफ्ते से',
              en: 'About a week',
            }),
          },
          {
            label: 'Over 2 weeks',
            value: 'more_2_weeks',
            label_localized: locText(language, {
              mr: '२ आठवड्यांपेक्षा जास्त',
              hi: '२ हफ्ते से अधिक',
              en: 'Over 2 weeks',
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
        question_localized: locText(language, {
          mr: 'त्रास वाढतो आहे की तसाच आहे?',
          hi: 'क्या तकलीफ़ बढ़ रही है या वैसी ही है?',
          en: 'Is the condition getting worse or staying the same?',
        }),
        field_key: 'hpi_progression',
        options: [
          {
            label: 'Getting worse',
            value: 'worsening',
            label_localized: locText(language, {
              mr: 'दिवसेंदिवस वाढतो आहे',
              hi: 'दिन-ब-दिन बढ़ रही है',
              en: 'Getting worse',
            }),
          },
          {
            label: 'Staying the same',
            value: 'same',
            label_localized: locText(language, {
              mr: 'तसाच आहे',
              hi: 'वैसी की वैसी ही है',
              en: 'Staying the same',
            }),
          },
          {
            label: 'Comes and goes',
            value: 'intermittent',
            label_localized: locText(language, {
              mr: 'कधी होतो, कधी थांबतो',
              hi: 'आती-जाती रहती है',
              en: 'Comes and goes',
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
      question_localized: locText(language, {
        mr: 'आपल्याला बीपी, शुगर (डायबिटीज) किंवा दमा यांसारखा आधीचा काही आजार आहे का?',
        hi: 'क्या आपको बीपी, शुगर (मधुमेह) या दमा जैसी कोई पुरानी बीमारी है?',
        en: 'Do you have any prior medical conditions (like BP, Sugar, or Asthma)?',
      }),
      field_key: 'past_medical_history',
      options: [
        {
          label: 'Diabetes (Sugar)',
          value: 'diabetes',
          label_localized: locText(language, {
            mr: 'शुगर / मधुमेह (Diabetes)',
            hi: 'शुगर / मधुमेह (Diabetes)',
            en: 'Diabetes (Sugar)',
          }),
        },
        {
          label: 'High BP',
          value: 'hypertension',
          label_localized: locText(language, {
            mr: 'हाय बीपी / रक्तदाब (High BP)',
            hi: 'उच्च रक्तचाप (High BP)',
            en: 'High BP',
          }),
        },
        {
          label: 'Both Sugar & BP',
          value: 'both',
          label_localized: locText(language, {
            mr: 'शुगर आणि बीपी दोन्ही',
            hi: 'शुगर और बीपी दोनों',
            en: 'Both Sugar & BP',
          }),
        },
        {
          label: 'Asthma / Breathing',
          value: 'asthma',
          label_localized: locText(language, {
            mr: 'दमा / अस्थमा (Asthma)',
            hi: 'दमा / अस्थमा',
            en: 'Asthma / Breathing',
          }),
        },
        {
          label: 'No prior conditions',
          value: 'none',
          label_localized: locText(language, {
            mr: 'काहीही नाही (None)',
            hi: 'कोई पुरानी बीमारी नहीं',
            en: 'No prior conditions',
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
      question_localized: locText(language, {
        mr: 'आपण दररोज काही औषधे घेता का, किंवा औषधांची ॲलर्जी आहे का?',
        hi: 'क्या आप कोई नियमित दवाई लेते हैं, या किसी दवा से एलर्जी है?',
        en: 'Are you taking any regular medications or do you have any allergies?',
      }),
      field_key: 'regular_meds',
      options: [
        {
          label: 'Taking daily medicines',
          value: 'daily_meds',
          label_localized: locText(language, {
            mr: 'होय, दररोज औषधे घेतो',
            hi: 'हाँ, नियमित दवाई ले रहा हूँ',
            en: 'Taking daily medicines',
          }),
        },
        {
          label: 'Have medicine allergies',
          value: 'has_allergy',
          label_localized: locText(language, {
            mr: 'होय, औषधांची ॲलर्जी आहे',
            hi: 'हाँ, दवाइयों से एलर्जी है',
            en: 'Have medicine allergies',
          }),
        },
        {
          label: 'Took painkiller today',
          value: 'took_painkiller',
          label_localized: locText(language, {
            mr: 'आजच वेदनाशामक गोळी घेतली',
            hi: 'आज ही दर्द की गोली ली थी',
            en: 'Took painkiller today',
          }),
        },
        {
          label: 'No regular medicines',
          value: 'none',
          label_localized: locText(language, {
            mr: 'नियमित औषध नाही',
            hi: 'कोई नियमित दवा नहीं',
            en: 'No regular medicines',
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
    question_localized: locText(language, {
      mr: 'धन्यवाद! आता आपण आपले जुने कागदपत्र व अहवाल स्कॅन करण्यास तयार आहोत.',
      hi: 'धन्यवाद। अब हम आपके पुराने पर्चे और जाँच रिपोर्ट स्कैन करने के लिए तैयार हैं।',
      en: 'Thank you. We are ready to scan your old prescriptions and reports.',
    }),
    field_key: 'ready_for_scan',
    options: [
      {
        label: 'Proceed to Scanner',
        value: 'proceed_scan',
        label_localized: locText(language, {
          mr: 'स्कॅनरकडे पुढे जा ➔',
          hi: 'स्कैनर पर आगे बढ़ें ➔',
          en: 'Proceed to Scanner ➔',
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
