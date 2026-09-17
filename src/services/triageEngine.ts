/**
 * triageEngine.ts
 * Multi-Doctor OPD Auto-Triage Engine for HealthNexa Kiosk
 *
 * Detects patient specialty from chief-complaint text using
 * multilingual keyword matching (mr / hi / en).
 * Pure function � no React, no side effects.
 */

export interface TriageResult {
  specialty: string
  specialtyMr: string
  specialtyHi: string
  room: string
  roomMr: string
  roomHi: string
  doctor: string
  icon: string
  urgencyColor: string
  urgencyTextColor: string
  estimatedWaitMinutes: number
  isEmergency: boolean
  triaged_at?: string
}

interface TriageRule {
  keywords: string[]
  result: Omit<TriageResult, 'estimatedWaitMinutes'>
}

const TRIAGE_RULES: TriageRule[] = [
  {
    keywords: [
      'chest', 'heart', 'cardiac', 'palpitation', 'angina', 'coronary',
      'chhati', 'chhaati',
      'seene', 'hridaya', 'dil', 'dhadhad', 'ghabraahat',
    ],
    result: {
      specialty: 'Cardiology',
      specialtyMr: '??????? ?????',
      specialtyHi: '???? ??? ?????',
      room: 'Room 1',
      roomMr: '???? ???. ?',
      roomHi: '???? ??. ?',
      doctor: 'Dr. A. Mehta, MD (Cardiology)',
      icon: 'heart',
      urgencyColor: 'bg-red-100',
      urgencyTextColor: 'text-red-900',
      isEmergency: true,
    },
  },
  {
    keywords: [
      'stroke', 'paralysis', 'seizure', 'epilepsy', 'unconscious',
      'migraine', 'memory', 'confusion', 'dizziness',
      'lakwa', 'pakshaghat', 'mirgi', 'daura', 'chakkar',
    ],
    result: {
      specialty: 'Neurology',
      specialtyMr: '??????????? ?????',
      specialtyHi: '???????? ??????? ?????',
      room: 'Room 2',
      roomMr: '???? ???. ?',
      roomHi: '???? ??. ?',
      doctor: 'Dr. R. Verma, DM (Neurology)',
      icon: 'brain',
      urgencyColor: 'bg-purple-100',
      urgencyTextColor: 'text-purple-900',
      isEmergency: false,
    },
  },
  {
    keywords: [
      'joint', 'knee', 'hip', 'back', 'spine', 'fracture', 'bone',
      'shoulder', 'ankle', 'wrist', 'muscle', 'sprain',
      'sandhe', 'gudha', 'kambhar', 'patha', 'had', 'fracture',
      'jod', 'ghutna', 'kamar', 'haddi', 'moc',
    ],
    result: {
      specialty: 'Orthopedics',
      specialtyMr: '???? ? ????? ?????',
      specialtyHi: '????? ?? ???? ?????',
      room: 'Room 3',
      roomMr: '???? ???. ?',
      roomHi: '???? ??. ?',
      doctor: 'Dr. S. Kulkarni, MS (Ortho)',
      icon: 'bone',
      urgencyColor: 'bg-blue-100',
      urgencyTextColor: 'text-blue-900',
      isEmergency: false,
    },
  },
  {
    keywords: [
      'skin', 'rash', 'itch', 'acne', 'eczema', 'psoriasis', 'allergy',
      'hives', 'blister', 'fungal', 'hair loss', 'dandruff',
      'twacha', 'khaj', 'dad', 'funsi', 'pimple', 'khujli',
    ],
    result: {
      specialty: 'Dermatology',
      specialtyMr: '???????? ?????',
      specialtyHi: '????? ??? ?????',
      room: 'Room 5',
      roomMr: '???? ???. ?',
      roomHi: '???? ??. ?',
      doctor: 'Dr. P. Joshi, MD (Derm)',
      icon: 'skin',
      urgencyColor: 'bg-pink-100',
      urgencyTextColor: 'text-pink-900',
      isEmergency: false,
    },
  },
  {
    keywords: [
      'stomach', 'abdomen', 'gastric', 'acidity', 'vomit', 'nausea',
      'diarrhea', 'constipation', 'liver', 'jaundice', 'indigestion',
      'pot', 'potadukhi', 'apchan', 'ulti', 'malmal', 'julab',
      'yakrit', 'kawil', 'acidity', 'pet', 'badahajami', 'matali',
    ],
    result: {
      specialty: 'Gastroenterology',
      specialtyMr: '????????? ?????',
      specialtyHi: '???? ????? ?????',
      room: 'Room 6',
      roomMr: '???? ???. ?',
      roomHi: '???? ??. ?',
      doctor: 'Dr. M. Gupta, DM (Gastro)',
      icon: 'gastro',
      urgencyColor: 'bg-orange-100',
      urgencyTextColor: 'text-orange-900',
      isEmergency: false,
    },
  },
  {
    keywords: [
      'eye', 'vision', 'cataract', 'glaucoma', 'blur', 'double vision',
      'dola', 'drishti', 'motibindu', 'kachbindu',
      'ankh', 'drishti', 'motiabind', 'glukoma',
    ],
    result: {
      specialty: 'Ophthalmology',
      specialtyMr: '????? ?????',
      specialtyHi: '????? ?????',
      room: 'Room 7',
      roomMr: '???? ???. ?',
      roomHi: '???? ??. ?',
      doctor: 'Dr. K. Desai, MS (Ophth)',
      icon: 'eye',
      urgencyColor: 'bg-cyan-100',
      urgencyTextColor: 'text-cyan-900',
      isEmergency: false,
    },
  },
  {
    keywords: [
      'ear', 'nose', 'throat', 'ent', 'hearing', 'tinnitus',
      'sore throat', 'sinusitis', 'tonsil', 'snoring',
      'kan', 'nak', 'ghasa', 'shravan', 'tonsilitis', 'saynas',
      'gala', 'nak band', 'kan dard',
    ],
    result: {
      specialty: 'ENT',
      specialtyMr: '???-???-??? ?????',
      specialtyHi: '???-???-??? ?????',
      room: 'Room 8',
      roomMr: '???? ???. ?',
      roomHi: '???? ??. ?',
      doctor: 'Dr. N. Patil, MS (ENT)',
      icon: 'ent',
      urgencyColor: 'bg-teal-100',
      urgencyTextColor: 'text-teal-900',
      isEmergency: false,
    },
  },
  {
    keywords: [
      'child', 'paediatric', 'pediatric', 'baby', 'infant', 'toddler',
      'mul', 'bal', 'lahan', 'bacha', 'shishu',
    ],
    result: {
      specialty: 'Paediatrics',
      specialtyMr: '?????? ?????',
      specialtyHi: '??? ??? ?????',
      room: 'Room 9',
      roomMr: '???? ???. ?',
      roomHi: '???? ??. ?',
      doctor: 'Dr. S. More, MD (Paeds)',
      icon: 'child',
      urgencyColor: 'bg-yellow-100',
      urgencyTextColor: 'text-yellow-900',
      isEmergency: false,
    },
  },
  {
    keywords: [
      'diabetes', 'thyroid', 'hormonal', 'sugar', 'insulin', 'obesity',
      'hyperthyroid', 'hypothyroid', 'adrenal',
      'madhumeh', 'thyraid', 'sakhar', 'insulin', 'harmon',
      'shugr', 'diabitis',
    ],
    result: {
      specialty: 'Endocrinology',
      specialtyMr: '?????????? ?????',
      specialtyHi: '?????????? ?????',
      room: 'Room 10',
      roomMr: '???? ???. ??',
      roomHi: '???? ??. ??',
      doctor: 'Dr. V. Singh, DM (Endo)',
      icon: 'endo',
      urgencyColor: 'bg-amber-100',
      urgencyTextColor: 'text-amber-900',
      isEmergency: false,
    },
  },
  {
    keywords: [
      'urine', 'kidney', 'urinary', 'bladder', 'prostate', 'renal',
      'stone', 'uti',
      'mutra', 'kidney', 'mutrashay', 'mutrapind', 'khada', 'peshab',
      'gurda', 'pathri',
    ],
    result: {
      specialty: 'Urology',
      specialtyMr: '???????????? ?????',
      specialtyHi: '????? ??? ?????',
      room: 'Room 11',
      roomMr: '???? ???. ??',
      roomHi: '???? ??. ??',
      doctor: 'Dr. A. Jain, MS (Uro)',
      icon: 'urology',
      urgencyColor: 'bg-sky-100',
      urgencyTextColor: 'text-sky-900',
      isEmergency: false,
    },
  },
  {
    keywords: [
      'mental', 'anxiety', 'depression', 'stress', 'panic', 'sleep',
      'insomnia', 'psychiatric', 'mood', 'phobia',
      'mansik', 'chinta', 'nairaishya', 'tanav', 'jhop', 'nidra',
      'ghabraahat', 'avasad',
    ],
    result: {
      specialty: 'Psychiatry',
      specialtyMr: '???????? ?????',
      specialtyHi: '?????? ?????',
      room: 'Room 12',
      roomMr: '???? ???. ??',
      roomHi: '???? ??. ??',
      doctor: 'Dr. L. Nair, MD (Psych)',
      icon: 'psych',
      urgencyColor: 'bg-violet-100',
      urgencyTextColor: 'text-violet-900',
      isEmergency: false,
    },
  },
]

const AYUSH_ROUTE: Omit<TriageResult, 'estimatedWaitMinutes'> = {
  specialty: 'AYUSH (Ayurveda)',
  specialtyMr: '???? (????????) ?????',
  specialtyHi: '???? (????????) ?????',
  room: 'Room A1',
  roomMr: '???? ???. ?-?',
  roomHi: '???? ??. ?-?',
  doctor: 'Vd. D. Tiwari, BAMS',
  icon: 'ayush',
  urgencyColor: 'bg-emerald-100',
  urgencyTextColor: 'text-emerald-900',
  isEmergency: false,
}

const GENERAL_MEDICINE_ROUTE: Omit<TriageResult, 'estimatedWaitMinutes'> = {
  specialty: 'General Medicine',
  specialtyMr: '??????? ???????? ?????',
  specialtyHi: '??????? ???????? ?????',
  room: 'Room 4',
  roomMr: '???? ???. ?',
  roomHi: '???? ??. ?',
  doctor: 'Dr. S. Sharma, MD',
  icon: 'general',
  urgencyColor: 'bg-teal-50',
  urgencyTextColor: 'text-teal-900',
  isEmergency: false,
}

const ROOM_BASE_WAIT: Record<string, number> = {
  'Room 1': 5,
  'Room 2': 10,
  'Room 3': 20,
  'Room 4': 15,
  'Room 5': 15,
  'Room 6': 20,
  'Room 7': 25,
  'Room 8': 20,
  'Room 9': 15,
  'Room 10': 30,
  'Room 11': 25,
  'Room 12': 20,
  'Room A1': 10,
}

export function getQueueWaitEstimate(room: string): number {
  const base = ROOM_BASE_WAIT[room] ?? 20
  const variance = (new Date().getMinutes() % 5) - 2
  return Math.max(5, base + variance)
}

export function detectSpecialty(
  chiefComplaintText: string,
  department: string = 'general_medicine'
): TriageResult {
  if (department === 'ayush' || department.includes('ayush')) {
    const wait = getQueueWaitEstimate('Room A1')
    return { ...AYUSH_ROUTE, estimatedWaitMinutes: wait }
  }

  const lowerText = chiefComplaintText.toLowerCase()

  for (const rule of TRIAGE_RULES) {
    if (rule.keywords.some((kw) => lowerText.includes(kw))) {
      const wait = getQueueWaitEstimate(rule.result.room)
      return { ...rule.result, estimatedWaitMinutes: wait }
    }
  }

  const wait = getQueueWaitEstimate('Room 4')
  return { ...GENERAL_MEDICINE_ROUTE, estimatedWaitMinutes: wait }
}

