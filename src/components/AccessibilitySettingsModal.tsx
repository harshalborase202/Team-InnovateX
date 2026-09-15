import React, { useEffect } from 'react'
import { useKiosk, TextSize } from '../context/KioskContext'
import {
  SUPPORTED_LANGUAGES,
  LanguageOption,
} from '../services/translations'

interface AccessibilitySettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const AccessibilitySettingsModal: React.FC<AccessibilitySettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    t,
    language,
    setLanguage,
    textSize,
    setTextSize,
    highContrast,
    setHighContrast,
    isSpeaking,
    replayAudio,
    playAudio,
  } = useKiosk()

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleLanguageChange = (opt: LanguageOption) => {
    setLanguage(opt.code)
    playAudio(opt.voiceGreeting, opt.speechCode)
  }

  const textSizeOptions: { id: TextSize; labelKey: string; labelEn: string; sizeSample: string }[] = [
    { id: 'normal', labelKey: 'textSizeNormal', labelEn: 'Normal', sizeSample: '18px' },
    { id: 'large', labelKey: 'textSizeLarge', labelEn: 'Large', sizeSample: '22px' },
    { id: 'extra-large', labelKey: 'textSizeExtraLarge', labelEn: 'Extra Large', sizeSample: '26px' },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="acc-settings-title"
      className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-3xl p-5 sm:p-8 max-w-2xl w-full shadow-2xl border-2 border-teal-200 flex flex-col max-h-[92vh] overflow-y-auto text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl sm:text-4xl" role="img" aria-hidden="true">
              ⚙️
            </span>
            <div>
              <h2
                id="acc-settings-title"
                className="text-2xl sm:text-3xl font-extrabold text-teal-950 tracking-tight"
              >
                {t('settings')}
              </h2>
              <p className="text-sm sm:text-base text-slate-500 font-medium">
                Accessibility, Text Size & Language
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-2xl cursor-pointer transition-colors border border-slate-300 active:scale-95"
            aria-label={t('closeSettings')}
          >
            ✕
          </button>
        </div>

        {/* ── 1. TEXT SIZE CONTROLS ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <span role="img" aria-hidden="true">
                🔍
              </span>
              <span>{t('textSize')}</span>
            </label>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-100 text-teal-900">
              Active: {textSize}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {textSizeOptions.map((opt) => {
              const isSelected = textSize === opt.id
              return (
                <button
                  key={opt.id}
                  id={`btn-text-size-${opt.id}`}
                  onClick={() => setTextSize(opt.id)}
                  type="button"
                  className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer min-h-[64px] ${
                    isSelected
                      ? 'bg-teal-700 text-white border-teal-800 ring-3 ring-teal-200 shadow-md'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300'
                  }`}
                  aria-pressed={isSelected}
                  aria-label={`${t(opt.labelKey)} text size`}
                >
                  <span
                    className="font-extrabold mb-1"
                    style={{
                      fontSize: opt.id === 'normal' ? '1rem' : opt.id === 'large' ? '1.25rem' : '1.5rem',
                    }}
                  >
                    A{opt.id === 'large' ? '+' : opt.id === 'extra-large' ? '++' : ''}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-center leading-tight">
                    {t(opt.labelKey)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── 2. HIGH CONTRAST TOGGLE ── */}
        <div className="mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl" role="img" aria-hidden="true">
                🌓
              </span>
              <span className="text-lg sm:text-xl font-extrabold text-slate-900">
                {t('highContrast')}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600">
              {t('highContrastDesc')}
            </p>
          </div>

          <button
            id="toggle-high-contrast"
            onClick={() => setHighContrast(!highContrast)}
            type="button"
            className={`px-6 py-3.5 rounded-2xl font-extrabold text-base sm:text-lg border-2 transition-all cursor-pointer min-h-[52px] flex items-center justify-center gap-2.5 ${
              highContrast
                ? 'bg-yellow-400 text-black border-yellow-500 shadow-lg ring-4 ring-yellow-200'
                : 'bg-white hover:bg-slate-100 text-slate-900 border-slate-400'
            }`}
            aria-pressed={highContrast}
            aria-label={`${t('highContrast')} toggle`}
          >
            <span>{highContrast ? '✅' : '⚪'}</span>
            <span>{highContrast ? t('highContrastOn') : t('highContrastOff')}</span>
          </button>
        </div>

        {/* ── 3. LANGUAGE SWITCHER ── */}
        <div className="mb-6">
          <label className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2 mb-3">
            <span role="img" aria-hidden="true">
              🌐
            </span>
            <span>{t('languageSelect')}</span>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {SUPPORTED_LANGUAGES.map((opt) => {
              const isSelected = language === opt.code
              return (
                <button
                  key={opt.code}
                  id={`btn-settings-lang-${opt.code}`}
                  onClick={() => handleLanguageChange(opt)}
                  type="button"
                  className={`flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all cursor-pointer min-h-[56px] text-left ${
                    isSelected
                      ? 'bg-teal-700 text-white border-teal-800 shadow-md ring-3 ring-teal-200'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                  }`}
                  aria-pressed={isSelected}
                  aria-label={`${opt.englishName} (${opt.nativeName})`}
                >
                  <div className="flex flex-col">
                    <span className="font-extrabold text-base">{opt.nativeName}</span>
                    <span
                      className={`text-xs ${
                        isSelected ? 'text-teal-100' : 'text-slate-500'
                      }`}
                    >
                      {opt.englishName}
                    </span>
                  </div>
                  <span className="text-2xl ml-2">{opt.flagEmoji}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── 4. REPEAT AUDIO BUTTON ── */}
        <div className="mb-6 p-4 rounded-2xl bg-teal-50 border border-teal-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl" role="img" aria-hidden="true">
              🔊
            </span>
            <span className="text-base sm:text-lg font-bold text-teal-950">
              {t('repeatAudioAria')}
            </span>
          </div>

          <button
            id="btn-settings-replay-audio"
            onClick={replayAudio}
            type="button"
            className={`w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-base transition-all cursor-pointer min-h-[48px] flex items-center justify-center gap-2 ${
              isSpeaking
                ? 'bg-amber-400 text-amber-950 ring-3 ring-amber-200 animate-pulse'
                : 'bg-teal-700 text-white hover:bg-teal-800'
            }`}
            aria-label={t('repeatAudio')}
          >
            <span>{isSpeaking ? '🔊' : '🔈'}</span>
            <span>{isSpeaking ? t('speakingNow') : t('repeatAudio')}</span>
          </button>
        </div>

        {/* Close Modal Action */}
        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            id="btn-close-settings"
            onClick={onClose}
            type="button"
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-lg shadow-md cursor-pointer transition-transform active:scale-95 min-h-[52px]"
          >
            {t('closeSettings')}
          </button>
        </div>
      </div>
    </div>
  )
}
