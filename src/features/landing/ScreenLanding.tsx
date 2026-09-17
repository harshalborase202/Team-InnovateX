import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKiosk } from '../../context/KioskContext'
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '../../services/translations'

// ─── Localized Content Map for Landing Screen ─────────────────────────────

interface RoleCardText {
  title: string
  desc: string
  action: string
  audio: string
  features: string[]
}

interface LandingText {
  hospitalBadge: string
  mainHeading: string
  mainSub: string
  audioGuidePrompt: string
  btnListen: string
  btnStop: string
  btnSettings: string
  cards: {
    kiosk: RoleCardText
    patient: RoleCardText
    clinician: RoleCardText
  }
  bottomTipTitle: string
  bottomTipDesc: string
  bottomTipBtn: string
}

const LANDING_TEXTS: Record<SupportedLanguage, LandingText> = {
  mr: {
    hospitalBadge: 'सरकारी रुग्णालय ओपीडी डिजिटल सेवा',
    mainHeading: 'आपण येथे कशासाठी आला आहात?',
    mainSub: 'खालीलपैकी योग्य पर्याय निवडा किंवा आवाजात ऐकण्यासाठी 🔊 बटण दाबा',
    audioGuidePrompt:
      'नमस्कार. शासकीय रुग्णालय ओपीडी पोर्टलवर आपले स्वागत आहे. जर तुम्ही नवीन रुग्ण असाल किंवा चिठ्ठी हवी असेल तर ओपीडी किओस्क निवडा. तुमचे जुने कागदपत्रे पाहण्यासाठी माझे आरोग्य खाते निवडा. डॉक्टर असल्यास डॉक्टर लॉगिन निवडा.',
    btnListen: 'आवाजात ऐका (Listen)',
    btnStop: 'आवाज थांबवा (Stop)',
    btnSettings: 'सुलभता',
    cards: {
      kiosk: {
        title: 'ओपीडी किओस्क',
        desc: 'नवीन नोंदणी, लक्षण संवाद व ओपीडी टोकन पर्ची',
        action: 'किओस्क सुरू करा',
        audio: 'ओपीडी किओस्क. ओपीडी नोंदणी आणि आवाज आधारित लक्षण संवादासाठी येथे स्पर्श करा.',
        features: ['आवाज + स्पर्श सहाय्यक', 'मराठी / हिंदी / English', 'त्वरित ओपीडी टोकन'],
      },
      patient: {
        title: 'माझे आरोग्य खाते',
        desc: 'जुने वैद्यकीय कागदपत्रे, डिजिटल चिठ्ठ्या व रिपोर्ट पाहा',
        action: 'खाते उघडा',
        audio: 'माझे आरोग्य खाते. जुने वैद्यकीय कागदपत्रे आणि डिजिटल चिठ्ठ्या पाहण्यासाठी येथे स्पर्श करा.',
        features: ['डिजिटल प्रिस्क्रिप्शन', 'ओपीडी भेट इतिहास', 'ABHA आयडी लिंक'],
      },
      clinician: {
        title: 'डॉक्टर लॉगिन',
        desc: 'रुग्णांचा AI क्लिनिकल सारांश व ओपीडी रांग पाहा',
        action: 'डॉक्टर पोर्टल',
        audio: 'डॉक्टर लॉगिन. डॉक्टरांसाठी रुग्णांचे वैद्यकीय सारांश पाहण्याची सुविधा.',
        features: ['AI क्लिनिकल सारांश', 'स्कॅन केलेल्या चिठ्ठ्या', 'ओपीडी पेशंट रांग'],
      },
    },
    bottomTipTitle: 'आपले आरोग्य रेकॉर्ड कायमचे जतन करू इच्छिता?',
    bottomTipDesc:
      'ओपीडी किओस्कवर नोंदणी केल्यानंतर, माझे आरोग्य खाते मध्ये लॉगिन करून जुने पर्चे व अहवाल कधीही पुन्हा पाहू शकता.',
    bottomTipBtn: 'खाते उघडा ➔',
  },
  hi: {
    hospitalBadge: 'सरकारी अस्पताल ओपीडी डिजिटल सेवा',
    mainHeading: 'आप आज अस्पताल किस सेवा के लिए आए हैं?',
    mainSub: 'नीचे दिए गए विकल्पों में से चुनें या आवाज़ में सुनने के लिए 🔊 बटन दबाएँ',
    audioGuidePrompt:
      'नमस्कार। सरकारी अस्पताल ओपीडी पोर्टल में आपका स्वागत है। ओपीडी पर्ची और लक्षण जाँच के लिए ओपीडी कियोस्क चुनें। पुराने पर्चे देखने के लिए मेरा स्वास्थ्य खाता चुनें। डॉक्टर के लिए डॉक्टर लॉगिन चुनें।',
    btnListen: 'आवाज़ में सुनें (Listen)',
    btnStop: 'आवाज़ रोकें (Stop)',
    btnSettings: 'सुगमता',
    cards: {
      kiosk: {
        title: 'ओपीडी कियोस्क',
        desc: 'नया पंजीकरण, लक्षण बातचीत व ओपीडी पर्ची प्राप्त करें',
        action: 'कियोस्क शुरू करें',
        audio: 'ओपीडी कियोस्क। ओपीडी पर्ची और आवाज़ से लक्षण बताने के लिए यहाँ दबाएँ।',
        features: ['आवाज़ + स्पर्श सहायक', 'बहुभाषी सहायता', 'त्वरित ओपीडी टोकन'],
      },
      patient: {
        title: 'मेरा स्वास्थ्य खाता',
        desc: 'पुराने पर्चे, डॉक्टर परामर्श और लैब रिपोर्ट देखें',
        action: 'खाता खोलें',
        audio: 'मेरा स्वास्थ्य खाता। पुराने पर्चे और लैब रिपोर्ट देखने के लिए यहाँ दबाएँ।',
        features: ['डिजिटल पर्चे', 'परामर्श इतिहास', 'ABHA आईडी लिंकेज'],
      },
      clinician: {
        title: 'डॉक्टर लॉगिन',
        desc: 'मरीज़ का AI-तैयार स्वास्थ्य इतिहास व पर्चे देखें',
        action: 'डॉक्टर पोर्टल',
        audio: 'डॉक्टर लॉगिन। मरीजों का क्लीनिकल सारांश देखने के लिए यहाँ दबाएँ।',
        features: ['AI क्लिनिकल सारांश', 'स्कैन किए पर्चे', 'मरीज़ कतार व्यू'],
      },
    },
    bottomTipTitle: 'क्या आप अपने स्वास्थ्य रिकॉर्ड सुरक्षित रखना चाहते हैं?',
    bottomTipDesc:
      'कियोस्क पंजीकरण के बाद, मेरा स्वास्थ्य खाता में लॉगिन कर अपने सभी पुराने पर्चे और रिपोर्ट डिजिटल रूप से देख सकते हैं।',
    bottomTipBtn: 'खाता खोलें ➔',
  },
  en: {
    hospitalBadge: 'Government Hospital OPD Digital Kiosk',
    mainHeading: 'Welcome! How can we assist you today?',
    mainSub: 'Select your role below or tap 🔊 for voice guidance',
    audioGuidePrompt:
      'Welcome to the Hospital OPD Portal. For walk-in registration and symptom interview, tap OPD Kiosk. To view past records, select Patient Account. For doctor access, select Doctor Login.',
    btnListen: 'Read Aloud (Voice)',
    btnStop: 'Stop Voice',
    btnSettings: 'Accessibility',
    cards: {
      kiosk: {
        title: 'Walk-In OPD Kiosk',
        desc: 'Voice health interview & instant OPD token slip generation',
        action: 'Start Kiosk',
        audio: 'Walk-In OPD Kiosk. Tap here for walk-in OPD registration and voice health interview.',
        features: ['Voice + Touch Assisted', 'Multilingual Support', 'Instant OPD Token'],
      },
      patient: {
        title: 'Personal Health Account',
        desc: 'Access past consultation records, prescriptions & lab reports',
        action: 'Open Account',
        audio: 'Personal Health Account. Tap here to access your medical history and digital prescriptions.',
        features: ['Digital Prescriptions', 'OPD Visit History', 'ABHA ID Linking'],
      },
      clinician: {
        title: 'Doctor Portal',
        desc: 'View AI clinical summaries, scanned prescriptions & OPD queue',
        action: 'Open Doctor Portal',
        audio: 'Clinician Portal. Access patient clinical summaries and OPD queue.',
        features: ['AI Clinical Summaries', 'Scanned Prescriptions', 'Patient Queue View'],
      },
    },
    bottomTipTitle: 'Want to store your OPD medical records safely?',
    bottomTipDesc:
      'After registering at the kiosk, log into Personal Health Account to access all your past prescriptions and diagnostic reports anytime.',
    bottomTipBtn: 'Open Account ➔',
  },
  ta: {
    hospitalBadge: 'அரசு மருத்துவமனை ஓபிடி மையம்',
    mainHeading: 'இன்று உங்களுக்கு எவ்வாறு உதவலாம்?',
    mainSub: 'கீழே உள்ள விருப்பத்தைத் தேர்ந்தெடுக்கவும் அல்லது 🔊 பொத்தானை அழுத்தவும்',
    audioGuidePrompt:
      'வணக்கம். மருத்துவமனை ஓபிடி மையத்திற்கு நல்வரவு. புதிய பதிவு மற்றும் ஓபிடி சீட்டு பெற ஓபிடி கியோஸ்க்கைத் தேர்ந்தெடுக்கவும்.',
    btnListen: 'குரல் வழிகாட்டல்',
    btnStop: 'நிறுத்து',
    btnSettings: 'அமைப்புகள்',
    cards: {
      kiosk: {
        title: 'ஓபிடி கியோஸ்க்',
        desc: 'குரல் வழிகாட்டல் மூலம் பதிவு செய்து ஓபிடி சீட்டு பெறவும்',
        action: 'தொடங்கவும்',
        audio: 'ஓபிடி கியோஸ்க். பதிவு செய்ய இங்கே தொடவும்.',
        features: ['குரல் + தொடு உதவி', 'பல மொழிகள்', 'உடனடி ஓபிடி சீட்டு'],
      },
      patient: {
        title: 'என் சுகாதார கணக்கு',
        desc: 'பழைய ஆலோசனை விவரங்கள் மற்றும் மருந்துச் சீட்டுகளைப் பார்க்கவும்',
        action: 'கணக்கை திறக்கவும்',
        audio: 'என் சுகாதார கணக்கு. பழைய பதிவுகளை பார்க்க இங்கே தொடவும்.',
        features: ['டிஜிட்டல் மருந்துச் சீட்டு', 'வருகை வரலாறு', 'ABHA இணைப்பு'],
      },
      clinician: {
        title: 'மருத்துவர் உள்நுழைவு',
        desc: 'நோயாளிகளின் மருத்துவ சுருக்கம் மற்றும் வரிசையைப் பார்க்கவும்',
        action: 'போர்ட்டலை திறக்கவும்',
        audio: 'மருத்துவர் போர்ட்டல். நோயாளிகளின் விவரங்களை பார்க்க இங்கே தொடவும்.',
        features: ['AI மருத்துவ சுருக்கம்', 'ஸ்கேன் சீட்டுகள்', 'நோயாளி வரிசை'],
      },
    },
    bottomTipTitle: 'உங்கள் மருத்துவப் பதிவுகளைப் பாதுகாக்க விரும்புகிறீர்களா?',
    bottomTipDesc:
      'பதிவு செய்த பிறகு, என் சுகாதார கணக்கில் உள்நுழைந்து உங்கள் பழைய மருந்துச் சீட்டுகளைப் பார்க்கலாம்.',
    bottomTipBtn: 'கணக்கை திறக்கவும் ➔',
  },
  bn: {
    hospitalBadge: 'সরকারি হাসপাতাল ওপিডি পরিষেবা',
    mainHeading: 'আপনাকে কীভাবে সাহায্য করতে পারি?',
    mainSub: 'নিচের বিকল্পটি বেছে নিন বা অডিও শুনতে 🔊 চাপুন',
    audioGuidePrompt:
      'নমস্কার। হাসপাতাল ওপিডি পোর্টালে স্বাগতম। ওপিডি টিকিটের জন্য ওপিডি কিয়স্ক বেছে নিন। পুরোনো প্রেসক্রিপশনের জন্য আমার স্বাস্থ্য অ্যাকাউন্ট বেছে নিন।',
    btnListen: 'ভয়েস শুনুন',
    btnStop: 'বন্ধ করুন',
    btnSettings: 'অ্যাক্সেসিবিলিটি',
    cards: {
      kiosk: {
        title: 'ওপিডি কিয়স্ক',
        desc: 'ভয়েস হেলথ ইন্টারভিউ ও তাৎক্ষণিক ওপিডি টিকিট',
        action: 'শুরু করুন',
        audio: 'ওপিডি কিয়স্ক। রেজিস্ট্রেশন ও ওপিডি টিকিটের জন্য চাপুন।',
        features: ['ভয়েস + টাচ সহায়তা', 'বহুভাষিক সমর্থন', 'তাৎক্ষণিক ওপিডি টিকিট'],
      },
      patient: {
        title: 'আমার স্বাস্থ্য অ্যাকাউন্ট',
        desc: 'পুরোনো প্রেসক্রিপশন ও ল্যাব রিপোর্ট দেখুন',
        action: 'অ্যাকাউন্ট খুলুন',
        audio: 'আমার স্বাস্থ্য অ্যাকাউন্ট। পুরোনো রেকর্ড দেখতে চাপুন।',
        features: ['ডিজিটাল প্রেসক্রিপশন', 'ভিজিট ইতিহাস', 'ABHA কার্ড সংযোগ'],
      },
      clinician: {
        title: 'ডাক্তার পোর্টাল',
        desc: 'রোগীদের এআই সামারি ও স্ক্যান করা প্রেসক্রিপশন দেখুন',
        action: 'পোর্টাল খুলুন',
        audio: 'ডাক্তার পোর্টাল। রোগীর এআই সামারি দেখার স্থান।',
        features: ['এআই ক্লিনিকাল সামারি', 'স্ক্যান প্রেসক্রিপশন', 'রোগীর লাইন ভিউ'],
      },
    },
    bottomTipTitle: 'আপনার মেডিকেল রেকর্ড সংরক্ষণ করতে চান?',
    bottomTipDesc:
      'কিয়স্কে নিবন্ধনের পর আমার স্বাস্থ্য অ্যাকাউন্টে লগইন করে পুরোনো প্রেসক্রিপশন দেখতে পারেন।',
    bottomTipBtn: 'অ্যাকাউন্ট খুলুন ➔',
  },
  te: {
    hospitalBadge: 'ప్రభుత్వ ఆసుపత్రి ఓపిడి డిజిటల్ సేవలు',
    mainHeading: 'ఈరోజు మేము మీకు ఎలా సహాయపడగలము?',
    mainSub: 'క్రింది ఎంపికను ఎంచుకోండి లేదా ఆడియో కోసం 🔊 నొక్కండి',
    audioGuidePrompt:
      'నమస్కారం. ఆసుపత్రి ఓపిడి పోర్టల్‌కు స్వాగతం. కొత్త నమోదు మరియు ఓపిడి స్లిప్ కోసం ఓపిడి కియోస్క్ ఎంచుకోండి.',
    btnListen: 'వాయిస్ వినండి',
    btnStop: 'ఆపండి',
    btnSettings: 'సెట్టింగ్‌లు',
    cards: {
      kiosk: {
        title: 'ఓపిడి కియోస్క్',
        desc: 'వాయిస్ హెల్త్ ఇంటర్వ్యూ మరియు తక్షణ ఓపిడి స్లిప్',
        action: 'ప్రారంభించండి',
        audio: 'ఓపిడి కియోస్క్. టోకెన్ మరియు వాయిస్ ఇంటర్వ్యూ కోసం ఇక్కడ నొక్కండి.',
        features: ['వాయిస్ + టచ్ సహాయం', 'బహుభాషా మద్దతు', 'తక్షణ ఓపిడి టోకెన్'],
      },
      patient: {
        title: 'నా ఆరోగ్య ఖాతా',
        desc: 'పాత ప్రిస్క్రిప్షన్లు మరియు ల్యాబ్ రిపోర్టులు చూడండి',
        action: 'ఖాతా తెరవండి',
        audio: 'నా ఆరోగ్య ఖాతా. పాత రిపోర్టులు చూడటానికి ఇక్కడ నొక్కండి.',
        features: ['డిజిటల్ ప్రిస్క్రిప్షన్లు', 'సందర్శన చరిత్ర', 'ABHA లింకేజ్'],
      },
      clinician: {
        title: 'డాక్టర్ లాగిన్',
        desc: 'పేషెంట్ క్లినికల్ సారాంశం మరియు క్యూ చూడండి',
        action: 'పోర్టల్ తెరవండి',
        audio: 'డాక్టర్ పోర్టల్. క్లినికల్ సారాంశం కోసం ఇక్కడ నొక్కండి.',
        features: ['AI క్లినికల్ సారాంశం', 'స్కాన్ చేసిన ప్రిస్క్రిప్షన్లు', 'పేషెంట్ క్యూ'],
      },
    },
    bottomTipTitle: 'మీ ఆరోగ్య వివరాలను సురక్షితంగా దాచుకోవాలా?',
    bottomTipDesc:
      'నమోదు చేసుకున్న తర్వాత, నా ఆరోగ్య ఖాతాలో లాగిన్ అయి మీ పాత రిపోర్టులను ఎప్పుడైనా చూడవచ్చు.',
    bottomTipBtn: 'ఖాతా తెరవండి ➔',
  },
}

// ─── Custom Icons ──────────────────────────────────────────────────────────

function HospitalKioskIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-8 h-8'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
      <path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
      <path d="M12 7v4" />
      <path d="M10 9h4" />
    </svg>
  )
}

function PatientDashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-8 h-8'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function DoctorLoginIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-8 h-8'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  )
}

// ─── Main Screen Landing Component ───────────────────────────────────────────

export function ScreenLanding() {
  const navigate = useNavigate()
  const { language, setLanguage, playAudio, stopAudio, isSpeaking, setIsSettingsOpen, highContrast } =
    useKiosk()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40)
    return () => clearTimeout(t)
  }, [])

  const currentTexts = LANDING_TEXTS[language] || LANDING_TEXTS.mr

  // Function to handle language change with immediate audio greeting
  const handleSelectLanguage = (langCode: SupportedLanguage) => {
    setLanguage(langCode)
    const targetOption = SUPPORTED_LANGUAGES.find((l) => l.code === langCode)
    if (targetOption) {
      playAudio(targetOption.voiceGreeting, targetOption.speechCode)
    }
  }

  // Function to play main landing page voice instructions
  const handlePlayMainAudio = () => {
    if (isSpeaking) {
      stopAudio()
    } else {
      playAudio(currentTexts.audioGuidePrompt)
    }
  }

  // Function to play individual role card audio
  const handlePlayCardAudio = (e: React.MouseEvent, cardAudioText: string) => {
    e.stopPropagation() // Don't trigger card navigation when pressing audio button
    playAudio(cardAudioText)
  }

  return (
    <div
      className={`min-h-screen flex flex-col relative selection:bg-teal-100 selection:text-teal-900 transition-colors ${
        highContrast
          ? 'bg-black text-yellow-400'
          : 'bg-gradient-to-b from-white via-sky-50/50 to-slate-100/80 text-slate-800'
      }`}
    >
      {/* Soft background mesh (Light mode only) */}
      {!highContrast && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div
            className="absolute -top-32 -left-32 w-[550px] h-[550px] rounded-full opacity-40 blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(15, 107, 142, 0.12) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full opacity-35 blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(5, 150, 105, 0.10) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] rounded-full opacity-30 blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%)',
            }}
          />
        </div>
      )}

      {/* ── Top Header with Multilingual Pills & Voice Controls ── */}
      <header
        className={`relative z-20 px-4 sm:px-6 py-3 border-b sticky top-0 backdrop-blur-md shadow-xs transition-colors ${
          highContrast
            ? 'bg-black border-yellow-400 text-yellow-400'
            : 'bg-white/90 border-slate-200/80'
        }`}
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl font-black shadow-md border ${
                  highContrast
                    ? 'bg-yellow-400 text-black border-yellow-300'
                    : 'bg-gradient-to-br from-teal-700 to-cyan-800 text-white border-teal-600/30'
                }`}
              >
                ✚
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black leading-tight tracking-tight">MediKiosk</h1>
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      highContrast
                        ? 'bg-yellow-400 text-black border-yellow-300'
                        : 'bg-teal-100 text-teal-800 border-teal-200'
                    }`}
                  >
                    Gov OPD
                  </span>
                </div>
                <p
                  className={`text-[11px] font-extrabold uppercase tracking-wider ${
                    highContrast ? 'text-yellow-300' : 'text-teal-700'
                  }`}
                >
                  {currentTexts.hospitalBadge}
                </p>
              </div>
            </div>

            {/* Mobile-only Settings Button */}
            <div className="flex sm:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className={`p-2 rounded-xl border text-sm font-bold flex items-center gap-1 ${
                  highContrast
                    ? 'border-yellow-400 text-yellow-400 bg-black'
                    : 'border-slate-300 bg-slate-50 text-slate-700'
                }`}

                title={currentTexts.btnSettings}
              >
                ⚙️ {currentTexts.btnSettings}
              </button>
            </div>
          </div>

          {/* Multilingual Selector & Voice Controls */}
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
            {/* Main Text-To-Voice (TTS) Button */}
            <button
              id="landing-btn-read-aloud"
              type="button"
              onClick={handlePlayMainAudio}
              className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center gap-2 border shadow-xs transition-all cursor-pointer min-h-[44px] active:scale-95 ${
                isSpeaking
                  ? 'bg-amber-400 text-amber-950 border-amber-500 animate-pulse ring-4 ring-amber-200'
                  : highContrast
                  ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                  : 'bg-teal-50 text-teal-900 border-teal-300 hover:bg-teal-100 ring-2 ring-teal-100'
              }`}
            >
              <span className="text-lg">{isSpeaking ? '🔊' : '🔈'}</span>
              <span>{isSpeaking ? currentTexts.btnStop : currentTexts.btnListen}</span>
            </button>

            {/* Accessibility Settings Gear */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold border transition-all cursor-pointer min-h-[44px] ${
                highContrast
                  ? 'border-yellow-400 text-yellow-400 bg-black hover:bg-zinc-900'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-xs'
              }`}
            >
              <span>⚙️</span>
              <span>{currentTexts.btnSettings}</span>
            </button>

            {/* Multilingual Language Switcher Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isActive = language === lang.code
                return (
                  <button
                    key={lang.code}
                    id={`lang-select-${lang.code}`}
                    type="button"
                    onClick={() => handleSelectLanguage(lang.code)}
                    className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all cursor-pointer flex items-center gap-1 min-h-[40px] active:scale-95 ${
                      isActive
                        ? highContrast
                          ? 'bg-yellow-400 text-black border-yellow-300 ring-2 ring-yellow-400'
                          : 'bg-amber-100 text-amber-950 border-amber-400 shadow-sm ring-2 ring-amber-300/80 font-black scale-105'
                        : highContrast
                        ? 'bg-black text-yellow-400 border-yellow-400/50 hover:border-yellow-400'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span>{lang.flagEmoji}</span>
                    <span>{lang.nativeName}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Hero Section ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 max-w-6xl mx-auto w-full">
        {/* Intro Heading & Subtitle */}
        <div
          className={`text-center mb-8 sm:mb-10 transition-all duration-700 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {/* Top Voice Prompt Pill */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-teal-200 bg-teal-50 text-teal-900 text-xs sm:text-sm font-bold mb-4 shadow-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>{currentTexts.hospitalBadge}</span>
          </div>

          <h2
            className={`text-3xl sm:text-5xl lg:text-6xl font-black leading-tight tracking-tight mb-3 ${
              highContrast ? 'text-yellow-400' : 'text-slate-900'
            }`}
          >
            {currentTexts.mainHeading}
          </h2>

          <p
            className={`text-base sm:text-lg max-w-2xl mx-auto font-medium ${
              highContrast ? 'text-yellow-200' : 'text-slate-600'
            }`}
          >
            {currentTexts.mainSub}
          </p>
        </div>

        {/* ── 3 Role Cards with Voice Assist Buttons ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* CARD 1: OPD Kiosk */}
          <div
            className={`transition-all duration-700 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
            style={{ transitionDelay: '80ms' }}
          >
            <div
              id="card-role-kiosk"
              onClick={() => navigate('/kiosk')}
              className={`group relative h-full flex flex-col justify-between rounded-3xl border-2 p-6 sm:p-7 transition-all duration-300 cursor-pointer shadow-md hover:shadow-2xl hover:-translate-y-1.5 active:scale-98 ${
                highContrast
                  ? 'bg-black border-yellow-400 hover:bg-zinc-900'
                  : 'bg-white border-teal-200 hover:border-teal-500'
              }`}
            >
              <div>
                {/* Header Icon + Speaker + Badge */}
                <div className="flex items-center justify-between mb-5">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all shadow-xs ${
                      highContrast
                        ? 'bg-yellow-400 text-black border-yellow-300'
                        : 'bg-teal-50 text-teal-700 border-teal-200 group-hover:bg-teal-100'
                    }`}
                  >
                    <HospitalKioskIcon className="w-8 h-8" />
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Speaker Button on Card */}
                    <button
                      type="button"
                      onClick={(e) => handlePlayCardAudio(e, currentTexts.cards.kiosk.audio)}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 active:scale-90 ${
                        highContrast
                          ? 'bg-yellow-400 text-black border-yellow-300'
                          : 'bg-teal-100 text-teal-900 border-teal-300 hover:bg-teal-200'
                      }`}
                      title="Listen to this option"
                    >
                      <span>🔊</span>
                      <span className="hidden sm:inline">ऐका</span>
                    </button>

                    <span
                      className={`text-xs font-black px-3 py-1 rounded-full border shadow-xs ${
                        highContrast
                          ? 'bg-yellow-400 text-black border-yellow-300'
                          : 'bg-teal-50 text-teal-800 border-teal-200'
                      }`}
                    >
                      Walk-In • Kiosk
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3
                  className={`text-2xl font-black mb-2 leading-snug transition-colors ${
                    highContrast ? 'text-yellow-400' : 'text-slate-900 group-hover:text-teal-800'
                  }`}
                >
                  {currentTexts.cards.kiosk.title}
                </h3>

                {/* Description */}
                <p
                  className={`text-sm font-medium leading-relaxed mb-4 ${
                    highContrast ? 'text-yellow-100' : 'text-slate-600'
                  }`}
                >
                  {currentTexts.cards.kiosk.desc}
                </p>

                {/* Feature Pills */}
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {currentTexts.cards.kiosk.features.map((feat) => (
                    <span
                      key={feat}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                        highContrast
                          ? 'bg-zinc-900 text-yellow-300 border-yellow-400/40'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-slate-100 mt-auto">
                <button
                  type="button"
                  tabIndex={-1}
                  className={`w-full py-3.5 px-4 rounded-2xl font-extrabold text-base border shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    highContrast
                      ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                      : 'bg-teal-700 hover:bg-teal-800 text-white border-teal-600'
                  }`}
                >
                  <span>{currentTexts.cards.kiosk.action}</span>
                  <span className="text-lg transition-transform group-hover:translate-x-1">➔</span>
                </button>
              </div>
            </div>
          </div>

          {/* CARD 2: Patient Dashboard */}
          <div
            className={`transition-all duration-700 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
            style={{ transitionDelay: '180ms' }}
          >
            <div
              id="card-role-patient"
              onClick={() => navigate('/patient')}
              className={`group relative h-full flex flex-col justify-between rounded-3xl border-2 p-6 sm:p-7 transition-all duration-300 cursor-pointer shadow-md hover:shadow-2xl hover:-translate-y-1.5 active:scale-98 ${
                highContrast
                  ? 'bg-black border-yellow-400 hover:bg-zinc-900'
                  : 'bg-white border-emerald-200 hover:border-emerald-500'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all shadow-xs ${
                      highContrast
                        ? 'bg-yellow-400 text-black border-yellow-300'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 group-hover:bg-emerald-100'
                    }`}
                  >
                    <PatientDashboardIcon className="w-8 h-8" />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handlePlayCardAudio(e, currentTexts.cards.patient.audio)}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 active:scale-90 ${
                        highContrast
                          ? 'bg-yellow-400 text-black border-yellow-300'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                      }`}
                      title="Listen to this option"
                    >
                      <span>🔊</span>
                      <span className="hidden sm:inline">ऐका</span>
                    </button>

                    <span
                      className={`text-xs font-black px-3 py-1 rounded-full border shadow-xs ${
                        highContrast
                          ? 'bg-yellow-400 text-black border-yellow-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      Personal Health
                    </span>
                  </div>
                </div>

                <h3
                  className={`text-2xl font-black mb-2 leading-snug transition-colors ${
                    highContrast ? 'text-yellow-400' : 'text-slate-900 group-hover:text-emerald-800'
                  }`}
                >
                  {currentTexts.cards.patient.title}
                </h3>

                <p
                  className={`text-sm font-medium leading-relaxed mb-4 ${
                    highContrast ? 'text-yellow-100' : 'text-slate-600'
                  }`}
                >
                  {currentTexts.cards.patient.desc}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-6">
                  {currentTexts.cards.patient.features.map((feat) => (
                    <span
                      key={feat}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                        highContrast
                          ? 'bg-zinc-900 text-yellow-300 border-yellow-400/40'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 mt-auto">
                <button
                  type="button"
                  tabIndex={-1}
                  className={`w-full py-3.5 px-4 rounded-2xl font-extrabold text-base border shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    highContrast
                      ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                      : 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-600'
                  }`}
                >
                  <span>{currentTexts.cards.patient.action}</span>
                  <span className="text-lg transition-transform group-hover:translate-x-1">➔</span>
                </button>
              </div>
            </div>
          </div>

          {/* CARD 3: Clinician Doctor Portal */}
          <div
            className={`transition-all duration-700 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
            style={{ transitionDelay: '280ms' }}
          >
            <div
              id="card-role-clinician"
              onClick={() => navigate('/clinician')}
              className={`group relative h-full flex flex-col justify-between rounded-3xl border-2 p-6 sm:p-7 transition-all duration-300 cursor-pointer shadow-md hover:shadow-2xl hover:-translate-y-1.5 active:scale-98 ${
                highContrast
                  ? 'bg-black border-yellow-400 hover:bg-zinc-900'
                  : 'bg-white border-indigo-200 hover:border-indigo-500'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all shadow-xs ${
                      highContrast
                        ? 'bg-yellow-400 text-black border-yellow-300'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200 group-hover:bg-indigo-100'
                    }`}
                  >
                    <DoctorLoginIcon className="w-8 h-8" />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handlePlayCardAudio(e, currentTexts.cards.clinician.audio)}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 active:scale-90 ${
                        highContrast
                          ? 'bg-yellow-400 text-black border-yellow-300'
                          : 'bg-indigo-100 text-indigo-900 border-indigo-300 hover:bg-indigo-200'
                      }`}
                      title="Listen to this option"
                    >
                      <span>🔊</span>
                      <span className="hidden sm:inline">ऐका</span>
                    </button>

                    <span
                      className={`text-xs font-black px-3 py-1 rounded-full border shadow-xs ${
                        highContrast
                          ? 'bg-yellow-400 text-black border-yellow-300'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}
                    >
                      Doctor Portal
                    </span>
                  </div>
                </div>

                <h3
                  className={`text-2xl font-black mb-2 leading-snug transition-colors ${
                    highContrast ? 'text-yellow-400' : 'text-slate-900 group-hover:text-indigo-800'
                  }`}
                >
                  {currentTexts.cards.clinician.title}
                </h3>

                <p
                  className={`text-sm font-medium leading-relaxed mb-4 ${
                    highContrast ? 'text-yellow-100' : 'text-slate-600'
                  }`}
                >
                  {currentTexts.cards.clinician.desc}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-6">
                  {currentTexts.cards.clinician.features.map((feat) => (
                    <span
                      key={feat}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                        highContrast
                          ? 'bg-zinc-900 text-yellow-300 border-yellow-400/40'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 mt-auto">
                <button
                  type="button"
                  tabIndex={-1}
                  className={`w-full py-3.5 px-4 rounded-2xl font-extrabold text-base border shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    highContrast
                      ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                      : 'bg-indigo-700 hover:bg-indigo-800 text-white border-indigo-600'
                  }`}
                >
                  <span>{currentTexts.cards.clinician.action}</span>
                  <span className="text-lg transition-transform group-hover:translate-x-1">➔</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom Information Tip Box ── */}
        <div
          className={`mt-10 sm:mt-12 w-full max-w-4xl transition-all duration-700 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: '380ms' }}
        >
          <div
            className={`flex flex-col sm:flex-row items-center sm:items-start gap-4 p-5 rounded-3xl border-2 shadow-md ${
              highContrast
                ? 'bg-black border-yellow-400 text-yellow-300'
                : 'bg-white border-emerald-200'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 border ${
                highContrast
                  ? 'bg-yellow-400 text-black border-yellow-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              💡
            </div>
            <div className="text-center sm:text-left flex-1">
              <h4 className="text-base font-extrabold">{currentTexts.bottomTipTitle}</h4>
              <p
                className={`text-xs sm:text-sm mt-1 leading-relaxed ${
                  highContrast ? 'text-yellow-100' : 'text-slate-600'
                }`}
              >
                {currentTexts.bottomTipDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/patient')}
              className={`px-4 py-2.5 rounded-xl text-xs font-extrabold border cursor-pointer shrink-0 transition-all ${
                highContrast
                  ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border-emerald-300'
              }`}
            >
              {currentTexts.bottomTipBtn}
            </button>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer
        className={`relative z-10 border-t px-6 py-4 mt-auto transition-colors ${
          highContrast
            ? 'bg-black border-yellow-400/50 text-yellow-300'
            : 'bg-white/80 border-slate-200/80 text-slate-500'
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>🔒 ABDM • आयुष्मान भारत • Health Kiosk Platform</span>
          </div>
          <div>
            <span>MediKiosk Healthcare System © 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
