import React from 'react'
import { useKiosk } from '../context/KioskContext'

export const CallForHelpButton: React.FC = () => {
  const {
    t,
    isRedFlagActive,
    isHelpModalOpen,
    setIsHelpModalOpen,
    callForHelp,
  } = useKiosk()

  // Hidden on the red-flag emergency screen, which already has its own emergency priority flow
  if (isRedFlagActive) {
    return null
  }

  return (
    <>
      {/* Fixed Call For Help Trigger Button */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          id="btn-call-for-help"
          onClick={callForHelp}
          type="button"
          aria-label={t('callHelpAria')}
          className="group flex items-center gap-3 px-5 sm:px-6 py-3.5 sm:py-4 rounded-3xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-base sm:text-lg shadow-2xl border-3 border-rose-300 ring-4 ring-rose-100/70 active:scale-95 transition-all duration-200 cursor-pointer min-h-[56px] min-w-[56px]"
        >
          <span className="text-2xl sm:text-3xl animate-bounce" role="img" aria-hidden="true">
            🛎️
          </span>
          <div className="flex flex-col text-left">
            <span className="leading-tight tracking-wide font-black">
              {t('callForHelp')}
            </span>
            <span className="text-xs font-semibold text-rose-100 hidden sm:inline">
              {t('callStaff')}
            </span>
          </div>
        </button>
      </div>

      {/* Staff Alerted Confirmation Modal */}
      {isHelpModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-modal-title"
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsHelpModalOpen(false)
          }}
        >
          <div className="bg-white rounded-3xl p-6 sm:p-10 max-w-lg w-full shadow-2xl border-3 border-amber-400 text-center flex flex-col items-center">
            {/* Animated Staff Beacon */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-amber-100 text-amber-900 flex items-center justify-center text-4xl sm:text-5xl mb-4 border-2 border-amber-300 shadow-md animate-pulse">
              🏃‍♂️
            </div>

            {/* Status Pill */}
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-950 font-extrabold px-4 py-1.5 rounded-full text-sm mb-3 border border-amber-300">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600 animate-ping" />
              <span>{t('helpStatusOnTheWay')}</span>
            </div>

            {/* Title */}
            <h2
              id="help-modal-title"
              className="text-2xl sm:text-3xl font-black text-slate-900 mb-2 tracking-tight"
            >
              {t('helpModalTitle')}
            </h2>

            {/* Kiosk Identifier */}
            <div className="mb-4 px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-mono font-bold text-xs sm:text-sm">
              📍 {t('kioskLocation')}
            </div>

            {/* Reassuring Explanation */}
            <p className="text-base sm:text-lg font-medium text-slate-700 mb-8 leading-relaxed">
              {t('helpModalDesc')}
            </p>

            {/* Action Buttons */}
            <div className="w-full flex flex-col sm:flex-row gap-3">
              <button
                id="btn-dismiss-help"
                onClick={() => setIsHelpModalOpen(false)}
                type="button"
                className="flex-1 py-4 px-6 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-base sm:text-lg shadow-md cursor-pointer transition-all active:scale-98 min-h-[52px]"
              >
                {t('dismissHelp')}
              </button>

              <button
                id="btn-call-again-help"
                onClick={callForHelp}
                type="button"
                className="py-4 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-base border border-slate-300 cursor-pointer transition-all active:scale-98 min-h-[52px]"
              >
                {t('callAgain')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
