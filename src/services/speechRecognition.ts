// Web Speech API Speech-to-Text (ASR) service for MediKiosk
// Allows elderly or low-literacy patients to speak their answers naturally

export interface SpeechRecognitionResultHandler {
  onTranscript: (text: string, isFinal: boolean) => void
  onError?: (err: string) => void
  onEnd?: () => void
}

class SpeechRecognitionService {
  private recognition: any = null
  private isListening = false

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition()
        this.recognition.continuous = false
        this.recognition.interimResults = true
      }
    }
  }

  public isSupported(): boolean {
    return !!this.recognition
  }

  public start(
    langCode: string = 'hi-IN',
    handlers: SpeechRecognitionResultHandler
  ): boolean {
    if (!this.recognition) {
      if (handlers.onError) handlers.onError('Speech recognition not supported on this browser')
      return false
    }

    try {
      this.recognition.lang = langCode
      this.isListening = true

      this.recognition.onresult = (event: any) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          } else {
            interimTranscript += event.results[i][0].transcript
          }
        }

        const text = finalTranscript || interimTranscript
        if (text) {
          handlers.onTranscript(text, !!finalTranscript)
        }
      }

      this.recognition.onerror = (event: any) => {
        console.warn('Speech recognition event:', event.error)
        this.isListening = false
        if (handlers.onError) handlers.onError(event.error)
      }

      this.recognition.onend = () => {
        this.isListening = false
        if (handlers.onEnd) handlers.onEnd()
      }

      this.recognition.start()
      return true
    } catch (err: any) {
      console.warn('Failed to start speech recognition:', err)
      this.isListening = false
      if (handlers.onError) handlers.onError(err.message)
      return false
    }
  }

  public stop(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop()
      } catch (err) {
        console.warn('Stop recognition error:', err)
      }
      this.isListening = false
    }
  }

  public getIsListening(): boolean {
    return this.isListening
  }
}

export const speechRecognitionService = new SpeechRecognitionService()
