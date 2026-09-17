import React from 'react'
import { useKiosk } from '../context/KioskContext'
import { AccessibilitySettingsModal } from './AccessibilitySettingsModal'
import { CallForHelpButton } from './CallForHelpButton'

export const PersistentAccessibilityControls: React.FC = () => {
  const { isSettingsOpen, setIsSettingsOpen } = useKiosk()

  return (
    <>
      {/* Settings Modal (Text size, High Contrast, Language Switcher) */}
      <AccessibilitySettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Call For Help Corner Button (Hidden during Red Flag emergency screen) */}
      <CallForHelpButton />
    </>
  )
}
