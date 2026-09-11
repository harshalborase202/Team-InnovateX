import React, { useState } from 'react'
import { KioskHeader } from '../../components/KioskHeader'
import { ScreenLanguage } from './ScreenLanguage'
import { ScreenIdentify } from './ScreenIdentify'
import { ScreenConsent } from './ScreenConsent'
import { useKiosk } from '../../context/KioskContext'

type SubStep = 'language' | 'identify' | 'consent'

export const IdentifyFlow: React.FC = () => {
  const [subStep, setSubStep] = useState<SubStep>('language')
  const { t } = useKiosk()

  const handleBack = () => {
    if (subStep === 'consent') {
      setSubStep('identify')
    } else if (subStep === 'identify') {
      setSubStep('language')
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-sky-50/50 text-slate-800">
      <KioskHeader
        showBack={subStep !== 'language'}
        onBack={handleBack}
        stepNumber={1}
        stepTitle={t('step1Title')}
      />

      <main className="flex-1 flex flex-col justify-center items-center">
        {subStep === 'language' && (
          <ScreenLanguage onNext={() => setSubStep('identify')} />
        )}

        {subStep === 'identify' && (
          <ScreenIdentify
            onNext={() => setSubStep('consent')}
            onBack={() => setSubStep('language')}
          />
        )}

        {subStep === 'consent' && (
          <ScreenConsent onBack={() => setSubStep('identify')} />
        )}
      </main>
    </div>
  )
}
