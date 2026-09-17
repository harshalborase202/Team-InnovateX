import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import {
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  TRANSLATIONS,
} from '../services/translations'
import { speechService } from '../services/speech'
import { Patient, Session } from '../types/database'

export type TextSize = 'normal' | 'large' | 'extra-large'

interface KioskContextType {
  language: SupportedLanguage
  setLanguage: (lang: SupportedLanguage) => void
  department: string
  setDepartment: (dept: string) => void
  t: (key: string) => string
  currentPatient: Patient | null
  setCurrentPatient: (patient: Patient | null) => void
  currentSession: Session | null
  setCurrentSession: (session: Session | null) => void
  isSpeaking: boolean
  playAudio: (text: string, customLang?: string) => void
  stopAudio: () => void
  replayAudio: () => void
  setScreenAudio: (text: string) => void

  // Accessibility Settings
  textSize: TextSize
  setTextSize: (size: TextSize) => void
  highContrast: boolean
  setHighContrast: (enabled: boolean) => void
  isSettingsOpen: boolean
  setIsSettingsOpen: (open: boolean) => void
  isHelpModalOpen: boolean
  setIsHelpModalOpen: (open: boolean) => void
  callForHelp: () => void
  isRedFlagActive: boolean
  setIsRedFlagActive: (active: boolean) => void
}

const KioskContext = createContext<KioskContextType | null>(null)

export const KioskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem('medikiosk_lang') as SupportedLanguage
    return saved && TRANSLATIONS[saved] ? saved : 'hi'
  })

  const [currentPatient, setCurrentPatient] = useState<Patient | null>(() => {
    try {
      const saved = sessionStorage.getItem('medikiosk_patient')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const [currentSession, setCurrentSession] = useState<Session | null>(() => {
    try {
      const saved = sessionStorage.getItem('medikiosk_session')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)
  const [lastScreenPrompt, setLastScreenPrompt] = useState<string>('')

  // Sync speech service state
  useEffect(() => {
    const unsubscribe = speechService.subscribe((speaking) => {
      setIsSpeaking(speaking)
    })
    return () => unsubscribe()
  }, [])

  // Sync patient & session to sessionStorage
  useEffect(() => {
    if (currentPatient) {
      sessionStorage.setItem('medikiosk_patient', JSON.stringify(currentPatient))
    } else {
      sessionStorage.removeItem('medikiosk_patient')
    }
  }, [currentPatient])

  useEffect(() => {
    if (currentSession) {
      sessionStorage.setItem('medikiosk_session', JSON.stringify(currentSession))
    } else {
      sessionStorage.removeItem('medikiosk_session')
    }
  }, [currentSession])

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang)
    localStorage.setItem('medikiosk_lang', lang)
  }, [])

  const t = useCallback(
    (key: string): string => {
      const dict = TRANSLATIONS[language] || TRANSLATIONS.en
      return dict[key] || TRANSLATIONS.en[key] || key
    },
    [language]
  )

  const getSpeechCode = useCallback((): string => {
    const opt = SUPPORTED_LANGUAGES.find((l) => l.code === language)
    return opt ? opt.speechCode : 'hi-IN'
  }, [language])

  const playAudio = useCallback(
    (text: string, customLang?: string) => {
      if (!text) return
      setLastScreenPrompt(text)
      const langCode = customLang || getSpeechCode()
      speechService.speak(text, langCode)
    },
    [getSpeechCode]
  )

  const stopAudio = useCallback(() => {
    speechService.stop()
  }, [])

  const replayAudio = useCallback(() => {
    if (lastScreenPrompt) {
      speechService.speak(lastScreenPrompt, getSpeechCode())
    }
  }, [lastScreenPrompt, getSpeechCode])

  const setScreenAudio = useCallback(
    (text: string) => {
      setLastScreenPrompt(text)
      playAudio(text)
    },
    [playAudio]
  )

  const [department, setDepartmentState] = useState<string>(() => {
    return localStorage.getItem('medikiosk_department') || 'general_medicine'
  })

  const setDepartment = useCallback((dept: string) => {
    setDepartmentState(dept)
    localStorage.setItem('medikiosk_department', dept)
  }, [])

  // ── Accessibility State ──
  const [textSize, setTextSizeState] = useState<TextSize>(() => {
    const saved = localStorage.getItem('medikiosk_text_size') as TextSize
    return saved === 'large' || saved === 'extra-large' ? saved : 'normal'
  })

  const [highContrast, setHighContrastState] = useState<boolean>(() => {
    return localStorage.getItem('medikiosk_high_contrast') === 'true'
  })

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false)
  const [isRedFlagActive, setIsRedFlagActive] = useState<boolean>(false)

  const setTextSize = useCallback((size: TextSize) => {
    setTextSizeState(size)
    localStorage.setItem('medikiosk_text_size', size)
  }, [])

  const setHighContrast = useCallback((enabled: boolean) => {
    setHighContrastState(enabled)
    localStorage.setItem('medikiosk_high_contrast', String(enabled))
  }, [])

  // Apply text size to root HTML element
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-text-size', textSize)
    root.classList.remove('text-size-normal', 'text-size-large', 'text-size-extra-large')
    root.classList.add(`text-size-${textSize}`)
  }, [textSize])

  // Apply high contrast class to root HTML element
  useEffect(() => {
    const root = document.documentElement
    if (highContrast) {
      root.classList.add('high-contrast')
    } else {
      root.classList.remove('high-contrast')
    }
  }, [highContrast])

  const callForHelp = useCallback(() => {
    setIsHelpModalOpen(true)
    const alertVoice = t('helpAudioNotice') || 'Hospital staff member has been alerted. Please remain seated, an assistant is on their way.'
    playAudio(alertVoice)
  }, [t, playAudio])

  return (
    <KioskContext.Provider
      value={{
        language,
        setLanguage,
        department,
        setDepartment,
        t,
        currentPatient,
        setCurrentPatient,
        currentSession,
        setCurrentSession,
        isSpeaking,
        playAudio,
        stopAudio,
        replayAudio,
        setScreenAudio,
        textSize,
        setTextSize,
        highContrast,
        setHighContrast,
        isSettingsOpen,
        setIsSettingsOpen,
        isHelpModalOpen,
        setIsHelpModalOpen,
        callForHelp,
        isRedFlagActive,
        setIsRedFlagActive,
      }}
    >
      {children}
    </KioskContext.Provider>
  )
}

export function useKiosk() {
  const context = useContext(KioskContext)
  if (!context) {
    throw new Error('useKiosk must be used within a KioskProvider')
  }
  return context
}
