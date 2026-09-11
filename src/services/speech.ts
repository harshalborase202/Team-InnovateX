// Web Speech API Text-to-Speech service for MediKiosk
// Provides fallback-safe, multilingual audio guidance

type SpeechListener = (speaking: boolean) => void

class SpeechService {
  private synth: SpeechSynthesis | null = null
  private listeners: Set<SpeechListener> = new Set()
  private isSpeaking = false

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis
    }
  }

  public subscribe(listener: SpeechListener): () => void {
    this.listeners.add(listener)
    listener(this.isSpeaking)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(speaking: boolean) {
    this.isSpeaking = speaking
    this.listeners.forEach((fn) => fn(speaking))
  }

  public stop(): void {
    if (this.synth) {
      try {
        this.synth.cancel()
      } catch (err) {
        console.warn('Speech cancellation error:', err)
      }
      this.notify(false)
    }
  }

  public speak(text: string, langCode: string = 'hi-IN', onEnd?: () => void): void {
    if (!this.synth || !text) {
      if (onEnd) onEnd()
      return
    }

    // Cancel any ongoing audio
    this.stop()

    // Resume synth if paused by browser
    if (this.synth.paused) {
      this.synth.resume()
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = langCode
    utterance.rate = 0.95 // Slightly slower for elderly / low-literacy clarity
    utterance.pitch = 1.0

    // Match best available native voice if available
    const voices = this.synth.getVoices?.() || []
    const prefix = langCode.split('-')[0].toLowerCase()
    const voice = voices.find(
      (v) => v.lang.toLowerCase() === langCode.toLowerCase() || v.lang.toLowerCase().startsWith(prefix)
    )
    if (voice) {
      utterance.voice = voice
    }

    utterance.onstart = () => {
      this.notify(true)
    }

    utterance.onend = () => {
      this.notify(false)
      if (onEnd) onEnd()
    }

    utterance.onerror = (e) => {
      console.warn('TTS utterance event:', e.error)
      this.notify(false)
      if (onEnd) onEnd()
    }

    try {
      this.synth.speak(utterance)
    } catch (err) {
      console.warn('Failed to invoke speech synthesis:', err)
      this.notify(false)
      if (onEnd) onEnd()
    }
  }

  public getSpeaking(): boolean {
    return this.isSpeaking
  }
}

export const speechService = new SpeechService()
