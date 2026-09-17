import React from 'react'
import { useKiosk } from '../context/KioskContext'

interface KioskHeaderProps {
  onBack?: () => void
  showBack?: boolean
  stepNumber?: number
  stepTitle?: string
}

export const KioskHeader: React.FC<KioskHeaderProps> = ({
  onBack,
  showBack = false,
  stepNumber = 1,
  stepTitle,
}) => {
  const { t, isSpeaking, replayAudio, setIsSettingsOpen, highContrast } = useKiosk()

  return (
    <header
      className={`w-full border-b shadow-xs px-4 sm:px-8 py-3 sticky top-0 z-40 transition-colors ${
        highContrast
          ? 'bg-black border-yellow-400 text-yellow-400'
          : 'bg-white border-sky-100 text-slate-800'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-4">
        {/* Left: Back button or Hospital Logo */}
        <div className="flex items-center gap-3">
          {showBack && onBack ? (
            <button
              id="kiosk-btn-back"
              onClick={onBack}
              type="button"
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-base transition-all min-h-[48px] cursor-pointer active:scale-95 ${
                highContrast
                  ? 'border-yellow-400 text-yellow-400 hover:bg-zinc-900'
                  : 'border-teal-700 text-teal-800 hover:bg-teal-50'
              }`}
              aria-label={t('back')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
              <span>{t('back')}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs ${
                  highContrast ? 'bg-yellow-400 text-black' : 'bg-teal-700 text-white'
                }`}
              >
                ✚
              </div>
              <div>
                <h1
                  className={`text-lg sm:text-xl font-extrabold leading-tight ${
                    highContrast ? 'text-yellow-400' : 'text-teal-950'
                  }`}
                >
                  {t('appTitle')}
                </h1>
                <span
                  className={`text-xs font-semibold uppercase tracking-wider block ${
                    highContrast ? 'text-yellow-300' : 'text-teal-700'
                  }`}
                >
                  OPD Pre-Consultation
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Center: Step Indicator */}
        {stepTitle && (
          <div
            className={`hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full border ${
              highContrast
                ? 'bg-zinc-900 border-yellow-400 text-yellow-300'
                : 'bg-sky-50 border-sky-200 text-teal-900'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center ${
                highContrast ? 'bg-yellow-400 text-black' : 'bg-teal-700 text-white'
              }`}
            >
              {stepNumber}
            </span>
            <span className="text-sm font-semibold">{stepTitle}</span>
          </div>
        )}

        {/* Right: Sound & Sugamyata (Accessibility Settings) Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Repeat Audio Speaker Button */}
          <button
            id="kiosk-btn-replay-audio"
            onClick={replayAudio}
            type="button"
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer min-h-[48px] ${
              isSpeaking
                ? 'bg-amber-400 text-amber-950 ring-4 ring-amber-200 animate-pulse shadow-md'
                : highContrast
                ? 'bg-black text-yellow-400 border-2 border-yellow-400 hover:bg-zinc-900'
                : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 active:scale-95'
            }`}
            title={t('repeatAudio')}
            aria-label={t('repeatAudioAria')}
          >
            <span className="text-lg sm:text-xl" role="img" aria-hidden="true">
              {isSpeaking ? '🔊' : '🔈'}
            </span>
            <span className="hidden sm:inline font-semibold">
              {isSpeaking ? t('speakingNow') : t('repeatAudio')}
            </span>
          </button>

          {/* Sugamyata / Accessibility Settings Button */}
          <button
            id="kiosk-btn-settings"
            onClick={() => setIsSettingsOpen(true)}
            type="button"
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer min-h-[48px] shadow-sm active:scale-95 ${
              highContrast
                ? 'bg-black text-yellow-400 border-2 border-yellow-400 hover:bg-zinc-900 ring-2 ring-yellow-400/40'
                : 'bg-white hover:bg-teal-50 text-teal-900 border-2 border-teal-600 ring-2 ring-teal-100'
            }`}
            title={t('openSettings')}
            aria-label={t('openSettings')}
          >
            <span className="text-lg sm:text-xl animate-spin-slow" role="img" aria-hidden="true">
              ⚙️
            </span>
            <span className="font-extrabold tracking-tight">
              {t('settings')}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
