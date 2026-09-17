import React, { useEffect } from 'react'
import { useKiosk } from '../../context/KioskContext'
import {
  SUPPORTED_LANGUAGES,
  LanguageOption,
} from '../../services/translations'
import { speechService } from '../../services/speech'

interface ScreenLanguageProps {
  onNext: () => void
}

export const ScreenLanguage: React.FC<ScreenLanguageProps> = ({ onNext }) => {
  const { language, setLanguage, setScreenAudio } = useKiosk()

  // On initial mount, announce the language selection prompt in Hindi, Marathi & English
  useEffect(() => {
    const welcomeText =
      'नमस्ते। कृपया अपनी पसंदीदा भाषा चुनें। नमस्कार. कृपया आपली भाषा निवडा. Please choose your preferred language.'
    setScreenAudio(welcomeText)
  }, [setScreenAudio])

  const handleSelectLanguage = (opt: LanguageOption) => {
    setLanguage(opt.code)
    // Speaks its own language name aloud immediately when tapped
    speechService.speak(opt.voiceGreeting, opt.speechCode, () => {
      // Smoothly advance after speech starts/completes
      onNext()
    })
    // Also advance if speech is delayed or silent
    setTimeout(() => {
      onNext()
    }, 800)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full">
      {/* Title & Guidance */}
      <div className="text-center mb-8 sm:mb-10">
        <div className="inline-flex items-center gap-2 bg-teal-100 text-teal-900 font-semibold px-4 py-1.5 rounded-full text-sm mb-4">
          <span>🗣️</span>
          <span>आवाज़ और टच सहायता / Voice & Touch Assisted</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-teal-950 tracking-tight mb-3">
          कृपया अपनी भाषा चुनें
        </h2>
        <p className="text-xl sm:text-2xl font-medium text-slate-600">
          Please select your preferred language to begin
        </p>
      </div>

      {/* Grid of Large Language Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 w-full max-w-3xl">
        {SUPPORTED_LANGUAGES.map((opt) => {
          const isSelected = language === opt.code
          return (
            <button
              key={opt.code}
              id={`btn-lang-${opt.code}`}
              onClick={() => handleSelectLanguage(opt)}
              type="button"
              className={`group relative flex flex-col items-start justify-center p-6 rounded-3xl border-3 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl active:scale-98 min-h-[110px] text-left ${
                isSelected
                  ? 'bg-teal-700 text-white border-teal-800 ring-4 ring-teal-200'
                  : 'bg-white text-slate-900 border-teal-200 hover:border-teal-500 hover:bg-teal-50/50'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-3xl sm:text-4xl font-extrabold tracking-wide font-serif">
                  {opt.nativeName}
                </span>
                <span className="text-2xl ml-2">{opt.flagEmoji}</span>
              </div>
              <div className="flex items-center justify-between w-full">
                <span
                  className={`text-base sm:text-lg font-semibold ${
                    isSelected ? 'text-teal-100' : 'text-slate-600'
                  }`}
                >
                  {opt.englishName}
                </span>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                    isSelected
                      ? 'bg-teal-800 text-white'
                      : 'bg-teal-100 text-teal-800 group-hover:bg-teal-200'
                  }`}
                >
                  🔊 टैप करें
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Reassurance Footer */}
      <div className="mt-10 sm:mt-12 text-center text-slate-500 text-base flex items-center gap-2">
        <span>🔒</span>
        <span>
          सरकारी अस्पताल ओपीडी सहायता — आपकी पूरी बातचीत सुरक्षित है
        </span>
      </div>
    </div>
  )
}
