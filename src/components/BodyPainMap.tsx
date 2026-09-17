import React, { useState, useCallback } from 'react'

// Body region zones — coordinates are percentage-based for responsiveness
interface BodyZone {
  id: string
  label_en: string
  label_hi: string
  label_mr: string
  cx: number // center x % of SVG viewBox
  cy: number // center y % of SVG viewBox
  r: number  // radius for hit-test circle
  side: 'front' | 'back' | 'both'
}

const BODY_ZONES: BodyZone[] = [
  // HEAD
  { id: 'head', label_en: 'Head', label_hi: 'सिर', label_mr: 'डोके', cx: 200, cy: 42, r: 32, side: 'both' },
  // NECK
  { id: 'neck', label_en: 'Neck', label_hi: 'गर्दन', label_mr: 'मान', cx: 200, cy: 95, r: 18, side: 'both' },
  // CHEST
  { id: 'chest', label_en: 'Chest', label_hi: 'छाती', label_mr: 'छाती', cx: 200, cy: 145, r: 38, side: 'front' },
  // LEFT SHOULDER
  { id: 'left_shoulder', label_en: 'L. Shoulder', label_hi: 'बायाँ कंधा', label_mr: 'डावा खांदा', cx: 142, cy: 128, r: 22, side: 'both' },
  // RIGHT SHOULDER
  { id: 'right_shoulder', label_en: 'R. Shoulder', label_hi: 'दायाँ कंधा', label_mr: 'उजवा खांदा', cx: 258, cy: 128, r: 22, side: 'both' },
  // ABDOMEN
  { id: 'abdomen', label_en: 'Abdomen', label_hi: 'पेट', label_mr: 'पोट', cx: 200, cy: 195, r: 35, side: 'front' },
  // BACK (upper)
  { id: 'upper_back', label_en: 'Upper Back', label_hi: 'पीठ (ऊपर)', label_mr: 'पाठ (वरची)', cx: 200, cy: 148, r: 36, side: 'back' },
  // LOWER BACK
  { id: 'lower_back', label_en: 'Lower Back', label_hi: 'कमर', label_mr: 'कंबर', cx: 200, cy: 210, r: 32, side: 'back' },
  // LEFT ARM
  { id: 'left_arm', label_en: 'L. Arm', label_hi: 'बायाँ हाथ', label_mr: 'डावा हात', cx: 112, cy: 180, r: 20, side: 'both' },
  // RIGHT ARM
  { id: 'right_arm', label_en: 'R. Arm', label_hi: 'दायाँ हाथ', label_mr: 'उजवा हात', cx: 288, cy: 180, r: 20, side: 'both' },
  // LEFT HIP
  { id: 'left_hip', label_en: 'L. Hip', label_hi: 'बायाँ कूल्हा', label_mr: 'डावा नितंब', cx: 172, cy: 248, r: 24, side: 'both' },
  // RIGHT HIP
  { id: 'right_hip', label_en: 'R. Hip', label_hi: 'दायाँ कूल्हा', label_mr: 'उजवा नितंब', cx: 228, cy: 248, r: 24, side: 'both' },
  // LEFT KNEE
  { id: 'left_knee', label_en: 'L. Knee', label_hi: 'बायाँ घुटना', label_mr: 'डावा गुडघा', cx: 168, cy: 330, r: 20, side: 'both' },
  // RIGHT KNEE
  { id: 'right_knee', label_en: 'R. Knee', label_hi: 'दायाँ घुटना', label_mr: 'उजवा गुडघा', cx: 232, cy: 330, r: 20, side: 'both' },
  // LEFT FOOT
  { id: 'left_foot', label_en: 'L. Foot', label_hi: 'बायाँ पैर', label_mr: 'डावा पाय', cx: 166, cy: 400, r: 18, side: 'both' },
  // RIGHT FOOT
  { id: 'right_foot', label_en: 'R. Foot', label_hi: 'दायाँ पैर', label_mr: 'उजवा पाय', cx: 234, cy: 400, r: 18, side: 'both' },
]

interface BodyPainMapProps {
  language: string
  onSelectionComplete: (selectedZoneLabels: string, rawZoneIds: string[]) => void
  onSkip: () => void
}

export const BodyPainMap: React.FC<BodyPainMapProps> = ({
  language,
  onSelectionComplete,
  onSkip,
}) => {
  const [view, setView] = useState<'front' | 'back'>('front')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const getLabel = useCallback(
    (zone: BodyZone): string => {
      if (language === 'mr') return zone.label_mr
      if (language === 'hi') return zone.label_hi
      return zone.label_en
    },
    [language]
  )

  const toggleZone = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visibleZones = BODY_ZONES.filter(
    (z) => z.side === 'both' || z.side === view
  )

  const handleConfirm = () => {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    const labels = ids.map((id) => {
      const zone = BODY_ZONES.find((z) => z.id === id)!
      return getLabel(zone)
    })
    const summary = labels.join(', ')
    onSelectionComplete(summary, ids)
  }

  const txt = {
    heading:
      language === 'mr'
        ? 'शरीरावर दुखणाऱ्या जागा दाखवा'
        : language === 'hi'
        ? 'शरीर पर दर्द की जगह दिखाएँ'
        : 'Tap where it hurts on the body',
    subheading:
      language === 'mr'
        ? 'एक किंवा अनेक भाग निवडा'
        : language === 'hi'
        ? 'एक या अधिक भाग चुनें'
        : 'Select one or more areas',
    front: language === 'mr' ? 'समोरून' : language === 'hi' ? 'सामने' : 'Front',
    back: language === 'mr' ? 'मागून' : language === 'hi' ? 'पीठ' : 'Back',
    confirm:
      language === 'mr'
        ? 'निवड पक्की करा'
        : language === 'hi'
        ? 'चयन पुष्टि करें'
        : 'Confirm Selection',
    skip:
      language === 'mr'
        ? 'वगळा (Skip)'
        : language === 'hi'
        ? 'छोड़ें (Skip)'
        : 'Skip this step',
    selected:
      language === 'mr'
        ? 'निवडलेल्या जागा:'
        : language === 'hi'
        ? 'चुनी गई जगहें:'
        : 'Selected areas:',
    noneSelected:
      language === 'mr'
        ? 'अद्याप कोणतीही जागा निवडलेली नाही'
        : language === 'hi'
        ? 'अभी कोई जगह नहीं चुनी'
        : 'No area selected yet',
  }

  return (
    <div className="w-full flex flex-col items-center">
      <h3 className="text-xl sm:text-2xl font-extrabold text-teal-950 mb-1 text-center">
        {txt.heading}
      </h3>
      <p className="text-sm font-semibold text-slate-500 mb-4 text-center">{txt.subheading}</p>

      {/* Front / Back Toggle */}
      <div className="flex bg-slate-100 rounded-2xl p-1 mb-5 gap-1">
        {(['front', 'back'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              view === v
                ? 'bg-teal-700 text-white shadow-md'
                : 'text-slate-600 hover:text-teal-800'
            }`}
          >
            {v === 'front' ? txt.front : txt.back}
          </button>
        ))}
      </div>

      {/* SVG Body Map */}
      <div className="relative w-full max-w-[260px] mx-auto select-none">
        <svg
          viewBox="0 0 400 440"
          className="w-full h-auto drop-shadow-sm"
          aria-label="Body diagram"
        >
          {/* Body silhouette paths — minimalist medical diagram */}
          {view === 'front' ? (
            <g fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="2">
              {/* Head */}
              <ellipse cx="200" cy="42" rx="30" ry="36" />
              {/* Neck */}
              <rect x="188" y="74" width="24" height="24" rx="6" />
              {/* Torso */}
              <path d="M148 98 Q200 90 252 98 L265 235 Q200 245 135 235 Z" />
              {/* Left arm */}
              <path d="M148 105 Q118 125 100 200 Q110 210 122 200 L140 128 Z" rx="10" />
              {/* Right arm */}
              <path d="M252 105 Q282 125 300 200 Q290 210 278 200 L260 128 Z" />
              {/* Left leg */}
              <path d="M162 232 L152 335 Q168 345 180 335 L178 232 Z" />
              {/* Right leg */}
              <path d="M238 232 L248 335 Q232 345 220 335 L222 232 Z" />
              {/* Left foot */}
              <ellipse cx="166" cy="400" rx="18" ry="10" />
              {/* Right foot */}
              <ellipse cx="234" cy="400" rx="18" ry="10" />
              {/* Foot connectors */}
              <rect x="157" y="332" width="18" height="72" rx="6" />
              <rect x="225" y="332" width="18" height="72" rx="6" />
            </g>
          ) : (
            <g fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="2">
              {/* Head (back) */}
              <ellipse cx="200" cy="42" rx="30" ry="36" />
              {/* Neck */}
              <rect x="188" y="74" width="24" height="24" rx="6" />
              {/* Back torso */}
              <path d="M148 98 Q200 90 252 98 L265 235 Q200 245 135 235 Z" />
              {/* Left arm */}
              <path d="M148 105 Q118 125 100 200 Q110 210 122 200 L140 128 Z" />
              {/* Right arm */}
              <path d="M252 105 Q282 125 300 200 Q290 210 278 200 L260 128 Z" />
              {/* Left leg */}
              <path d="M162 232 L152 335 Q168 345 180 335 L178 232 Z" />
              {/* Right leg */}
              <path d="M238 232 L248 335 Q232 345 220 335 L222 232 Z" />
              {/* Left foot */}
              <ellipse cx="166" cy="400" rx="18" ry="10" />
              {/* Right foot */}
              <ellipse cx="234" cy="400" rx="18" ry="10" />
              <rect x="157" y="332" width="18" height="72" rx="6" />
              <rect x="225" y="332" width="18" height="72" rx="6" />
            </g>
          )}

          {/* Interactive zone hit areas */}
          {visibleZones.map((zone) => {
            const isSelected = selected.has(zone.id)
            return (
              <g key={zone.id} onClick={() => toggleZone(zone.id)} style={{ cursor: 'pointer' }}>
                {/* Invisible large hit target */}
                <circle
                  cx={zone.cx}
                  cy={zone.cy}
                  r={zone.r + 8}
                  fill="transparent"
                />
                {/* Visual dot */}
                <circle
                  cx={zone.cx}
                  cy={zone.cy}
                  r={isSelected ? zone.r * 0.85 : zone.r * 0.6}
                  fill={isSelected ? '#ef4444' : '#0d9488'}
                  fillOpacity={isSelected ? 0.85 : 0.25}
                  stroke={isSelected ? '#b91c1c' : '#0d9488'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  className="transition-all duration-150"
                />
                {/* Pulse ring for selected */}
                {isSelected && (
                  <circle
                    cx={zone.cx}
                    cy={zone.cy}
                    r={zone.r + 4}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeOpacity="0.4"
                  />
                )}
                {/* Label */}
                <text
                  x={zone.cx}
                  y={zone.cy + zone.r + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill={isSelected ? '#b91c1c' : '#475569'}
                  fontFamily="Inter, sans-serif"
                >
                  {getLabel(zone)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Selected areas summary chip strip */}
      <div className="w-full mt-4 min-h-[40px]">
        {selected.size === 0 ? (
          <p className="text-center text-sm text-slate-400 font-semibold">{txt.noneSelected}</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from(selected).map((id) => {
              const zone = BODY_ZONES.find((z) => z.id === id)!
              return (
                <span
                  key={id}
                  onClick={() => toggleZone(id)}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-red-50 border border-red-200 text-red-800 cursor-pointer hover:bg-red-100 transition-colors"
                >
                  {getLabel(zone)} ✕
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="w-full flex flex-col gap-2.5 mt-5">
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={handleConfirm}
          className={`w-full py-4 rounded-2xl font-extrabold text-lg transition-all ${
            selected.size > 0
              ? 'bg-teal-700 hover:bg-teal-800 text-white shadow-lg cursor-pointer'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {txt.confirm}
          {selected.size > 0 && (
            <span className="ml-2 bg-white/20 text-white text-sm font-bold px-2 py-0.5 rounded-full">
              {selected.size}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-semibold text-slate-500 hover:text-slate-700 underline cursor-pointer py-1"
        >
          {txt.skip}
        </button>
      </div>
    </div>
  )
}
