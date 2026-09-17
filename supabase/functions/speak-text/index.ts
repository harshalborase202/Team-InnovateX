// Supabase Edge Function: speak-text
// Server-side text-to-speech using Google Cloud TTS API.
// Returns base64-encoded MP3 audio for the frontend to play.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SpeakRequest {
  text: string
  language: string // 'hi-IN', 'en-IN', 'mr-IN', 'ta-IN', 'bn-IN', 'te-IN'
}

interface SpeakResponse {
  audio_base64: string
  content_type: string
}

// Voice configuration for each supported language
// Uses Wavenet voices for Hindi/English (highest quality), Standard for others
const VOICE_CONFIG: Record<string, { languageCode: string; name: string; ssmlGender: string }> = {
  'hi-IN': { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A', ssmlGender: 'FEMALE' },
  'en-IN': { languageCode: 'en-IN', name: 'en-IN-Wavenet-A', ssmlGender: 'FEMALE' },
  'mr-IN': { languageCode: 'mr-IN', name: 'mr-IN-Standard-A', ssmlGender: 'FEMALE' },
  'ta-IN': { languageCode: 'ta-IN', name: 'ta-IN-Standard-A', ssmlGender: 'FEMALE' },
  'bn-IN': { languageCode: 'bn-IN', name: 'bn-IN-Standard-A', ssmlGender: 'FEMALE' },
  'te-IN': { languageCode: 'te-IN', name: 'te-IN-Standard-A', ssmlGender: 'FEMALE' },
}

// Map short language codes to BCP-47
const LANG_MAP: Record<string, string> = {
  'hi': 'hi-IN',
  'en': 'en-IN',
  'mr': 'mr-IN',
  'ta': 'ta-IN',
  'bn': 'bn-IN',
  'te': 'te-IN',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_CLOUD_API_KEY not configured in Supabase secrets' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const payload: SpeakRequest = await req.json()
    const { text, language } = payload

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'text is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Resolve language code
    const langCode = LANG_MAP[language] || language || 'hi-IN'
    const voiceConfig = VOICE_CONFIG[langCode] || VOICE_CONFIG['hi-IN']

    // Call Google Cloud TTS API
    const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`

    const ttsRequestBody = {
      input: { text },
      voice: {
        languageCode: voiceConfig.languageCode,
        name: voiceConfig.name,
        ssmlGender: voiceConfig.ssmlGender,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.9, // Slightly slower for elderly patients
        pitch: 0.0,
        volumeGainDb: 2.0, // Slightly louder for kiosk environment
      },
    }

    const ttsRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ttsRequestBody),
    })

    if (!ttsRes.ok) {
      const errBody = await ttsRes.text()
      console.error(`Google TTS API error (${ttsRes.status}):`, errBody)
      return new Response(
        JSON.stringify({ error: 'Text-to-speech API call failed', details: errBody }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      )
    }

    const ttsData = await ttsRes.json()

    if (!ttsData.audioContent) {
      return new Response(
        JSON.stringify({ error: 'No audio content returned from TTS API' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      )
    }

    const response: SpeakResponse = {
      audio_base64: ttsData.audioContent,
      content_type: 'audio/mp3',
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err: any) {
    console.error('speak-text error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Text-to-speech failed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
