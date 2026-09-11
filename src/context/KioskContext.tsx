import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import {
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  TRANSLATIONS,
} from '../services/translations'
import { speechService } from '../services/speech'
import { Patient, Session } from '../types/database'

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
