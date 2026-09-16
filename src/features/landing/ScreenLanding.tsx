import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Role Card Data ──────────────────────────────────────────────────────────

interface RoleCard {
  id: string
  badgeText: string
  badgeBorder: string
  badgeBg: string
  badgeTextCol: string
  iconBg: string
  iconBorder: string
  iconColor: string
  cardBorder: string
  cardHoverBorder: string
  btnBg: string
  btnText: string
  btnBorder: string
  titleHi: string
  titleMr: string
  titleEn: string
  descHi: string
  descMr: string
  descEn: string
  actionHi: string
  actionMr: string
  actionEn: string
  route: string
  features: string[]
}

const ROLE_CARDS: RoleCard[] = [
  {
    id: 'kiosk',
    badgeText: 'Walk-In • OPD Kiosk',
    badgeBorder: 'border-teal-200',
    badgeBg: 'bg-teal-50',
    badgeTextCol: 'text-teal-800',
    iconBg: 'bg-teal-50',
    iconBorder: 'border-teal-200 group-hover:border-teal-400 group-hover:bg-teal-100/80',
    iconColor: 'text-teal-700',
    cardBorder: 'border-slate-200/90',
    cardHoverBorder: 'hover:border-teal-500',
    btnBg: 'bg-teal-700 hover:bg-teal-800',
    btnText: 'text-white',
    btnBorder: 'border-teal-600',
    titleHi: 'OPD कियोस्क',
    titleMr: 'OPD किओस्क',
    titleEn: 'Hospital Kiosk',
    descHi: 'ओपीडी में आए नए मरीज़ यहाँ से सीधी पर्ची व लक्षण साक्षात्कार शुरू करें',
    descMr: 'ओपीडीमध्ये आलेल्या रुग्णांसाठी थेट नोंदणी व आरोग्य संवाद',
    descEn: 'Walk-in OPD patients: start voice interview and generate token slip',
    actionHi: 'कियोस्क शुरू करें',
    actionMr: 'किओस्क सुरू करा',
    actionEn: 'Start Kiosk',
    route: '/kiosk',
    features: ['मराठी • हिंदी • English', 'Voice + Touch Assisted', 'Instant OPD Token'],
  },
  {
    id: 'patient',
    badgeText: 'Personal Health Account',
    badgeBorder: 'border-emerald-200',
    badgeBg: 'bg-emerald-50',
    badgeTextCol: 'text-emerald-800',
    iconBg: 'bg-emerald-50',
    iconBorder: 'border-emerald-200 group-hover:border-emerald-400 group-hover:bg-emerald-100/80',
    iconColor: 'text-emerald-700',
    cardBorder: 'border-slate-200/90',
    cardHoverBorder: 'hover:border-emerald-500',
    btnBg: 'bg-emerald-700 hover:bg-emerald-800',
    btnText: 'text-white',
    btnBorder: 'border-emerald-600',
    titleHi: 'मेरा स्वास्थ्य खाता',
    titleMr: 'माझे आरोग्य खाते',
    titleEn: 'Patient Dashboard',
    descHi: 'पिछले ओपीडी परामर्श, डिजिटल पर्चे और लैब रिपोर्ट देखें — लॉगिन करें',
    descMr: 'मागील ओपीडी सल्लामसलत, डिजिटल चिठ्ठ्या आणि लॅब अहवाल पाहा',
    descEn: 'View past consultations, prescriptions & lab reports anytime',
    actionHi: 'लॉगिन / खाता बनाएं',
    actionMr: 'लॉगिन / खाते उघडा',
    actionEn: 'Login / Register',
    route: '/patient',
    features: ['Visit History & Summaries', 'Digital Prescriptions', 'ABHA ID Linking'],
  },
  {
    id: 'clinician',
    badgeText: 'Doctor Portal',
    badgeBorder: 'border-indigo-200',
    badgeBg: 'bg-indigo-50',
    badgeTextCol: 'text-indigo-800',
    iconBg: 'bg-indigo-50',
    iconBorder: 'border-indigo-200 group-hover:border-indigo-400 group-hover:bg-indigo-100/80',
    iconColor: 'text-indigo-700',
    cardBorder: 'border-slate-200/90',
    cardHoverBorder: 'hover:border-indigo-500',
    btnBg: 'bg-indigo-700 hover:bg-indigo-800',
    btnText: 'text-white',
    btnBorder: 'border-indigo-600',
    titleHi: 'डॉक्टर लॉगिन',
    titleMr: 'डॉक्टर लॉगिन',
    titleEn: 'Clinician Login',
    descHi: 'मरीज़ का पूरा नैदानिक सारांश देखें — AI-तैयार स्वास्थ्य इतिहास व रिकॉर्ड',
    descMr: 'रुग्णाचा संपूर्ण वैद्यकीय सारांश, AI-तयार आरोग्य इतिहास आणि नोंदी',
    descEn: 'Access patient clinical summaries, queue view & scanned prescriptions',
    actionHi: 'डॉक्टर पोर्टल खोलें',
    actionMr: 'डॉक्टर पोर्टल उघडा',
    actionEn: 'Open Doctor Portal',
    route: '/clinician',
    features: ['AI Clinical Summaries', 'Scanned Prescriptions', 'Patient Queue View'],
  },
]

// ─── Custom Neat SVG Icons ───────────────────────────────────────────────────

function HospitalKioskIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-7 h-7'}
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
      className={className || 'w-7 h-7'}
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
      className={className || 'w-7 h-7'}
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function ScreenLanding() {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white via-sky-50/40 to-slate-100/70 text-slate-800 relative selection:bg-teal-100 selection:text-teal-900">
      {/* ── Soft decorative background mesh ── */}
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

      {/* ── Top Header ── */}
      <header className="relative z-10 px-6 py-4 border-b border-slate-200/80 bg-white/85 backdrop-blur-md sticky top-0 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-xl font-black bg-gradient-to-br from-teal-700 to-cyan-800 shadow-md shadow-teal-900/15 border border-teal-600/30">
              ✚
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 leading-tight tracking-tight">
                  MediKiosk
                </h1>
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-teal-100/80 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                  Gov OPD
                </span>
              </div>
              <p className="text-[11px] font-bold text-teal-700 tracking-wider uppercase">
                Digital Hospital Healthcare Platform
              </p>
            </div>
          </div>

          {/* Multilingual Pills */}
          <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">
            {[
              { label: 'मराठी', sub: 'Marathi', highlight: true },
              { label: 'हिंदी', sub: 'Hindi' },
              { label: 'English', sub: 'EN' },
              { label: 'தமிழ்', sub: 'Tamil' },
              { label: 'বাংলা', sub: 'Bengali' },
              { label: 'తెలుగు', sub: 'Telugu' },
            ].map((lang) => (
              <span
                key={lang.sub}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-default ${
                  lang.highlight
                    ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs ring-1 ring-amber-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title={lang.sub}
              >
                {lang.label}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main Hero Content ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-14 max-w-6xl mx-auto w-full">
        {/* Intro Badge & Heading */}
        <div
          className={`text-center mb-10 sm:mb-12 transition-all duration-700 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-teal-200 bg-teal-50 text-teal-900 text-xs sm:text-sm font-bold mb-4 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
            <span>सरकारी रुग्णालय ओपीडी सहाय्यक · Government Hospital OPD Portal</span>
          </div>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-tight tracking-tight mb-3">
            आपण येथे का आला आहात?
            <br />
            <span className="bg-gradient-to-r from-teal-700 via-cyan-700 to-indigo-700 bg-clip-text text-transparent">
              Who are you today?
            </span>
          </h2>

          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto font-medium">
            खालीलपैकी योग्य पर्याय निवडून पुढे जा ·{' '}
            <span className="text-slate-500">Select your role to get started</span>
          </p>
        </div>

        {/* ── 3 Role Cards with Neat Borders & Icons ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {ROLE_CARDS.map((card, idx) => {
            return (
              <div
                key={card.id}
                className={`transition-all duration-700 ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                }`}
                style={{ transitionDelay: `${80 + idx * 100}ms` }}
              >
                <div
                  id={`card-role-${card.id}`}
                  onClick={() => navigate(card.route)}
                  className={`group relative h-full flex flex-col justify-between bg-white rounded-3xl border-2 ${card.cardBorder} ${card.cardHoverBorder} p-6 sm:p-7 transition-all duration-300 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-1`}
                >
                  {/* Top Bar: Neat Icon Container + Badge */}
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      {/* Neat Icon Box with crisp border */}
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-200 shadow-xs ${card.iconBg} ${card.iconBorder} ${card.iconColor}`}
                      >
                        {card.id === 'kiosk' && <HospitalKioskIcon className="w-8 h-8" />}
                        {card.id === 'patient' && <PatientDashboardIcon className="w-8 h-8" />}
                        {card.id === 'clinician' && <DoctorLoginIcon className="w-8 h-8" />}
                      </div>

                      {/* Neat Pill Badge */}
                      <span
                        className={`text-xs font-extrabold px-3 py-1 rounded-full border shadow-xs ${card.badgeBg} ${card.badgeBorder} ${card.badgeTextCol}`}
                      >
                        {card.badgeText}
                      </span>
                    </div>

                    {/* Card Title */}
                    <div className="mb-3">
                      <h3 className="text-2xl font-black text-slate-900 leading-snug group-hover:text-teal-900 transition-colors">
                        {card.titleMr}
                      </h3>
                      <p className="text-sm font-bold text-slate-500 mt-0.5">
                        {card.titleHi} · {card.titleEn}
                      </p>
                    </div>

                    {/* Descriptions */}
                    <p className="text-sm font-medium text-slate-700 leading-relaxed mb-1">
                      {card.descMr}
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">
                      {card.descEn}
                    </p>

                    {/* Key feature pills with neat borders */}
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      {card.features.map((feat) => (
                        <span
                          key={feat}
                          className="text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg"
                        >
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Neat Action Button with Clean Border & Hover */}
                  <div className="pt-2 border-t border-slate-100 mt-auto">
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full py-3.5 px-4 rounded-2xl font-extrabold text-sm sm:text-base border shadow-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${card.btnBg} ${card.btnText} ${card.btnBorder} active:scale-98`}
                    >
                      <span>{card.actionMr} ({card.actionEn})</span>
                      <span className="text-lg transition-transform group-hover:translate-x-1">➔</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Clean Bottom Information Tip ── */}
        <div
          className={`mt-10 sm:mt-12 w-full max-w-4xl transition-all duration-700 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: '400ms' }}
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-5 rounded-3xl bg-white border-2 border-emerald-200/80 shadow-md">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center text-2xl shrink-0">
              💡
            </div>
            <div className="text-center sm:text-left flex-1">
              <h4 className="text-base font-extrabold text-emerald-950">
                आपले आरोग्य रेकॉर्ड कायमचे जतन करू इच्छिता? (Save your OPD health records)
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                ओपीडी किओस्कवर नोंदणी केल्यानंतर, <strong className="text-emerald-800">माझे आरोग्य खाते (Patient Dashboard)</strong> मध्ये लॉगिन करून आपले जुने पर्चे, अहवाल व डॉक्टरांचे सारांश कधीही पुन्हा पाहू शकता.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/patient')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 cursor-pointer shrink-0 transition-colors"
            >
              खाते उघडा ➔
            </button>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-slate-200/80 bg-white/70 px-6 py-4 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>🔒 ABDM व आयुष्मान भारत प्रमाणित • HIPAA-aligned</span>
            <span>·</span>
            <span>सुरक्षित आणि खाजगी / Secure & Private</span>
          </div>
          <div>
            <span>MediKiosk Digital OPD Platform © 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
