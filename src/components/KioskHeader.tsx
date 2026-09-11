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
  const { t, isSpeaking, replayAudio } = useKiosk()

  return (
    <header className="w-full bg-white border-b border-sky-100 shadow-xs px-4 sm:px-8 py-3 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Back button or Hospital Logo */}
        <div className="flex items-center gap-3">
          {showBack && onBack ? (
            <button
              onClick={onBack}
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-teal-700 text-teal-800 font-semibold text-base hover:bg-teal-50 active:scale-95 transition-transform min-h-[48px] cursor-pointer"
              aria-label={t('back')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
              <span>{t('back')}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-2xl bg-teal-700 flex items-center justify-center text-white font-bold text-xl shadow-sm">
                ✚
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-teal-900 leading-tight">
                  {t('appTitle')}
                </h1>
                <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                  OPD Pre-Consultation
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Center: Step Indicator */}
        {stepTitle && (
          <div className="hidden sm:flex items-center gap-2 bg-sky-50 border border-sky-200 px-3.5 py-1.5 rounded-full">
            <span className="w-6 h-6 rounded-full bg-teal-700 text-white font-bold text-xs flex items-center justify-center">
              {stepNumber}
            </span>
            <span className="text-sm font-semibold text-teal-900">{stepTitle}</span>
          </div>
        )}

        {/* Right: Persistent Speaker Audio Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={replayAudio}
            type="button"
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-bold text-base transition-all duration-200 cursor-pointer min-h-[52px] ${
              isSpeaking
                ? 'bg-amber-400 text-amber-950 ring-4 ring-amber-200 animate-pulse shadow-md'
                : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 active:scale-95'
            }`}
            title={t('repeatAudio')}
            aria-label={t('repeatAudio')}
          >
            {/* Speaker icon with animated waves when speaking */}
            <span className="text-xl" role="img" aria-label="speaker">
              {isSpeaking ? '🔊' : '🔈'}
            </span>
            <span className="hidden md:inline font-semibold">
              {isSpeaking ? t('speakingNow') : t('repeatAudio')}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
