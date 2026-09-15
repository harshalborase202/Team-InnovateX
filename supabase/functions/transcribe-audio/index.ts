// Supabase Edge Function: transcribe-audio
// Server-side speech-to-text using Google Cloud Speech-to-Text API.
// Keeps the API key server-side. Receives base64-encoded audio from the frontend.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TranscribeRequest {
  audio: string // base64-encoded audio data
  language: string // BCP-47 language code e.g. 'hi-IN', 'en-IN'
  encoding?: string // 'WEBM_OPUS' | 'LINEAR16' | 'FLAC'
  sample_rate_hertz?: number
}

interface TranscribeResponse {
  transcript: string
  confidence: number
  language_code: string
}

// Map MediKiosk language codes to Google STT BCP-47 codes
const LANGUAGE_MAP: Record<string, string> = {
  'hi': 'hi-IN',
  'en': 'en-IN',
  'mr': 'mr-IN',
  'ta': 'ta-IN',
  'bn': 'bn-IN',
  'te': 'te-IN',
  'hi-IN': 'hi-IN',
  'en-IN': 'en-IN',
  'mr-IN': 'mr-IN',
  'ta-IN': 'ta-IN',
  'bn-IN': 'bn-IN',
  'te-IN': 'te-IN',
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

    const payload: TranscribeRequest = await req.json()
    const { audio, language, encoding = 'WEBM_OPUS', sample_rate_hertz = 48000 } = payload

    if (!audio) {
      return new Response(
        JSON.stringify({ error: 'audio (base64) is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const langCode = LANGUAGE_MAP[language] || 'hi-IN'

    // Call Google Cloud Speech-to-Text v1 REST API
    const sttUrl = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`

    const sttRequestBody = {
      config: {
        encoding: encoding,
        sampleRateHertz: sample_rate_hertz,
        languageCode: langCode,
        // Enable automatic punctuation for better readability
        enableAutomaticPunctuation: true,
        // Use enhanced model for better accuracy with Indian accents
        model: 'latest_long',
        // Allow alternative languages for code-switching (common in India)
        alternativeLanguageCodes: langCode.startsWith('en')
          ? ['hi-IN']
          : ['en-IN'],
      },
      audio: {
        content: audio,
      },
    }

    const sttRes = await fetch(sttUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sttRequestBody),
    })

    if (!sttRes.ok) {
      const errBody = await sttRes.text()
      console.error(`Google STT API error (${sttRes.status}):`, errBody)
      return new Response(
        JSON.stringify({ error: 'Speech-to-text API call failed', details: errBody }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      )
    }

    const sttData = await sttRes.json()

    // Extract transcript from the response
    const results = sttData.results || []
    let transcript = ''
    let confidence = 0

    if (results.length > 0) {
      // Concatenate all result transcripts
      const transcripts: string[] = []
      let totalConfidence = 0
      let count = 0

      for (const result of results) {
        if (result.alternatives && result.alternatives.length > 0) {
          transcripts.push(result.alternatives[0].transcript)
          totalConfidence += result.alternatives[0].confidence || 0
          count++
        }
      }

      transcript = transcripts.join(' ').trim()
      confidence = count > 0 ? totalConfidence / count : 0
    }

    const response: TranscribeResponse = {
      transcript,
      confidence,
      language_code: langCode,
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err: any) {
    console.error('transcribe-audio error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Transcription failed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
