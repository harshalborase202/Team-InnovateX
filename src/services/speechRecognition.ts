// Speech-to-Text service for MediKiosk
// Uses Web Speech API (Chrome, Edge, Safari, Android) for instant, zero-latency real-time transcription.
// Falls back to MediaRecorder + transcribe-audio Edge Function when Web Speech API is not supported.

import { supabase } from '../lib/supabase'

export interface SpeechRecognitionResultHandler {
  onTranscript: (text: string, isFinal: boolean) => void
  onError?: (err: string) => void
  onEnd?: () => void
}

class SpeechRecognitionService {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private isListening = false
  private webSpeechRecognition: any = null

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false
    const hasWebSpeech = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices
    return hasWebSpeech || hasMediaRecorder
  }

  public start(
    langCode: string = 'hi-IN',
    handlers: SpeechRecognitionResultHandler
  ): boolean {
    this.stop() // Clean up any active session first

    // 1. Primary engine: Web Speech API (supported in Chrome, Edge, Safari, Android)
    // Provides immediate real-time live streaming of speech directly in browser
    const SpeechRecognitionClass =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null

    if (SpeechRecognitionClass) {
      const started = this.startWebSpeech(SpeechRecognitionClass, langCode, handlers)
      if (started) return true
    }

    // 2. Fallback engine: MediaRecorder + transcribe-audio Edge Function
    if (typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      this.startMediaRecorder(langCode, handlers)
      return true
    }

    if (handlers.onError) {
      handlers.onError('इस ब्राउज़र में आवाज़ पहचान समर्थित नहीं है। कृपया लिखकर उत्तर दें। (Speech recognition not supported on this browser. Please type your answer.)')
    }
    return false
  }

  private startWebSpeech(
    SpeechRecognitionClass: any,
    langCode: string,
    handlers: SpeechRecognitionResultHandler
  ): boolean {
    try {
      const recognition = new SpeechRecognitionClass()
      this.webSpeechRecognition = recognition

      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = langCode
      recognition.maxAlternatives = 1

      this.isListening = true
      handlers.onTranscript('🎤 सुन रहे हैं... कृपया बोलें (Listening... please speak)', false)

      let lastRecognizedText = ''

      recognition.onresult = (event: any) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i]
          if (res.isFinal) {
            finalTranscript += res[0].transcript + ' '
          } else {
            interimTranscript += res[0].transcript
          }
        }

        const combined = (finalTranscript + interimTranscript).trim()
        if (combined) {
          lastRecognizedText = combined
          handlers.onTranscript(combined, !!finalTranscript.trim())
        }
      }

      recognition.onerror = (event: any) => {
        console.warn('Web Speech recognition event:', event.error)

        // 'no-speech' is non-fatal — user simply paused
        if (event.error === 'no-speech') {
          if (lastRecognizedText) {
            handlers.onTranscript(lastRecognizedText, true)
          }
          return
        }

        // 'aborted' happens on manual stop
        if (event.error === 'aborted') {
          return
        }

        // Permission denied
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.isListening = false
          if (handlers.onError) {
            handlers.onError('माइक्रोफ़ोन की अनुमति नहीं मिली। कृपया ब्राउज़र URL बार में माइक आइकॉन पर क्लिक करके अनुमति दें। (Microphone blocked. Please allow mic in browser.)')
          }
          return
        }

        // Network error with Web Speech API — fallback to MediaRecorder
        if (event.error === 'network') {
          console.info('Web Speech network error, attempting MediaRecorder fallback...')
          this.startMediaRecorder(langCode, handlers)
          return
        }

        this.isListening = false
        if (handlers.onError) handlers.onError(`Speech recognition error: ${event.error}`)
      }

      recognition.onend = () => {
        this.isListening = false
        if (lastRecognizedText) {
          handlers.onTranscript(lastRecognizedText, true)
        }
        if (handlers.onEnd) handlers.onEnd()
      }

      recognition.start()
      return true
    } catch (err: any) {
      console.warn('Failed to start Web Speech recognition:', err)
      this.isListening = false
      return false
    }
  }

  private async startMediaRecorder(
    langCode: string,
    handlers: SpeechRecognitionResultHandler
  ): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      })

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'

      this.mediaRecorder = new MediaRecorder(stream, { mimeType })
      this.audioChunks = []
      this.isListening = true

      handlers.onTranscript('🎤 सुन रहे हैं... (Listening...)', false)

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())

        if (this.audioChunks.length === 0) {
          this.isListening = false
          if (handlers.onEnd) handlers.onEnd()
          return
        }

        const audioBlob = new Blob(this.audioChunks, { type: mimeType })
        handlers.onTranscript('⏳ प्रसंस्करण हो रहा है... (Processing...)', false)

        try {
          const base64Audio = await this.blobToBase64(audioBlob)
          const encoding = mimeType.includes('webm') ? 'WEBM_OPUS' : 'MP3'

          const { data, error } = await supabase.functions.invoke('transcribe-audio', {
            body: {
              audio: base64Audio,
              language: langCode,
              encoding,
              sample_rate_hertz: 48000,
            },
          })

          if (error) {
            console.warn('Transcribe Edge Function error:', error)
            if (handlers.onError) {
              handlers.onError('वॉयस सेवा कनेक्ट नहीं हुई। कृपया लिखकर उत्तर दें। (Voice service unavailable. Please type or pick an option below.)')
            }
          } else if (data && data.transcript) {
            handlers.onTranscript(data.transcript, true)
          } else {
            handlers.onTranscript('', true)
            if (handlers.onError) handlers.onError('आवाज़ स्पष्ट नहीं थी, कृपया दोबारा बोलें। (Could not understand speech. Please try again.)')
          }
        } catch (err: any) {
          console.warn('Transcription processing error:', err)
          if (handlers.onError) handlers.onError(err.message || 'Transcription failed')
        }

        this.isListening = false
        if (handlers.onEnd) handlers.onEnd()
      }

      this.mediaRecorder.onerror = (event: any) => {
        console.warn('MediaRecorder error:', event.error)
        stream.getTracks().forEach((track) => track.stop())
        this.isListening = false
        if (handlers.onError) handlers.onError('Recording error occurred')
        if (handlers.onEnd) handlers.onEnd()
      }

      this.mediaRecorder.start(1000)
    } catch (err: any) {
      console.warn('Failed to start MediaRecorder:', err)
      this.isListening = false
      if (handlers.onError) {
        handlers.onError('माइक्रोफ़ोन की अनुमति नहीं मिली। (Microphone access denied. Please allow microphone access.)')
      }
    }
  }

  public stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch (err) {
        console.warn('Stop MediaRecorder error:', err)
      }
    }

    if (this.webSpeechRecognition) {
      try {
        // Detach listeners so onend does NOT echo old speech into the next turn
        this.webSpeechRecognition.onresult = null
        this.webSpeechRecognition.onend = null
        this.webSpeechRecognition.onerror = null
        this.webSpeechRecognition.stop()
      } catch (err) {
        console.warn('Stop Web Speech recognition error:', err)
      }
      this.webSpeechRecognition = null
    }

    this.isListening = false
  }

  public getIsListening(): boolean {
    return this.isListening
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1] || result
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }
}

export const speechRecognitionService = new SpeechRecognitionService()
