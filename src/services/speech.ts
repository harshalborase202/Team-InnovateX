// Text-to-Speech service for MediKiosk
// Uses server-side Google Cloud TTS via the speak-text Edge Function.
// Falls back to Web Speech API SpeechSynthesis if the Edge Function is unavailable.
// Provides multilingual audio guidance with natural-sounding voices.

import { supabase } from '../lib/supabase'

type SpeechListener = (speaking: boolean) => void

class SpeechService {
  private synth: SpeechSynthesis | null = null
  private listeners: Set<SpeechListener> = new Set()
  private isSpeaking = false
  private currentAudio: HTMLAudioElement | null = null
  // Cache for recently synthesized audio to avoid redundant API calls
  private audioCache: Map<string, string> = new Map()
  private maxCacheSize = 20

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
    // Stop server-side audio playback
    if (this.currentAudio) {
      try {
        this.currentAudio.pause()
        this.currentAudio.currentTime = 0
        this.currentAudio.src = ''
      } catch (err) {
        console.warn('Audio stop error:', err)
      }
      this.currentAudio = null
    }

    // Stop Web Speech API fallback
    if (this.synth) {
      try {
        this.synth.cancel()
      } catch (err) {
        console.warn('Speech cancellation error:', err)
      }
    }

    this.notify(false)
  }

  public speak(text: string, langCode: string = 'hi-IN', onEnd?: () => void): void {
    if (!text) {
      if (onEnd) onEnd()
      return
    }

    // Cancel any ongoing audio
    this.stop()

    // Try server-side TTS first, fall back to Web Speech API
    this.speakViaServer(text, langCode, onEnd)
  }

  private async speakViaServer(text: string, langCode: string, onEnd?: () => void): Promise<void> {
    // Check cache first
    const cacheKey = `${langCode}:${text.substring(0, 100)}`
    const cachedAudioUrl = this.audioCache.get(cacheKey)

    if (cachedAudioUrl) {
      this.playAudioUrl(cachedAudioUrl, onEnd)
      return
    }

    try {
      const { data, error } = await supabase.functions.invoke('speak-text', {
        body: {
          text,
          language: langCode,
        },
      })

      if (error || !data || !data.audio_base64) {
        console.warn('speak-text Edge Function unavailable, falling back to Web Speech API:', error)
        this.speakViaWebSpeech(text, langCode, onEnd)
        return
      }

      // Convert base64 audio to a blob URL
      const audioBytes = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0))
      const audioBlob = new Blob([audioBytes], { type: data.content_type || 'audio/mp3' })
      const audioUrl = URL.createObjectURL(audioBlob)

      // Cache the audio URL (evict oldest if cache is full)
      if (this.audioCache.size >= this.maxCacheSize) {
        const firstKey = this.audioCache.keys().next().value
        if (firstKey) {
          const oldUrl = this.audioCache.get(firstKey)
          if (oldUrl) URL.revokeObjectURL(oldUrl)
          this.audioCache.delete(firstKey)
        }
      }
      this.audioCache.set(cacheKey, audioUrl)

      this.playAudioUrl(audioUrl, onEnd)
    } catch (err) {
      console.warn('Server TTS failed, using Web Speech API fallback:', err)
      this.speakViaWebSpeech(text, langCode, onEnd)
    }
  }

  private playAudioUrl(audioUrl: string, onEnd?: () => void): void {
    const audio = new Audio(audioUrl)
    this.currentAudio = audio

    audio.onplay = () => {
      this.notify(true)
    }

    audio.onended = () => {
      this.currentAudio = null
      this.notify(false)
      if (onEnd) onEnd()
    }

    audio.onerror = (e) => {
      console.warn('Audio playback error:', e)
      this.currentAudio = null
      this.notify(false)
      if (onEnd) onEnd()
    }

    audio.play().catch((err) => {
      console.warn('Audio play() rejected:', err)
      // Browser autoplay policy may block — fall back to Web Speech
      this.currentAudio = null
      this.notify(false)
      if (onEnd) onEnd()
    })
  }

  private speakViaWebSpeech(text: string, langCode: string, onEnd?: () => void): void {
    if (!this.synth) {
      if (onEnd) onEnd()
      return
    }

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
