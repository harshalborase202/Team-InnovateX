// Supabase Edge Function: digitize-document
// Extracts structured clinical data from photographed prescriptions, lab tests, and discharge summaries.
// Swappable architecture: currently returns realistic structured mock data, ready for OCR/Multimodal Vision models (GPT-4o / Gemini Vision).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DigitizeRequest {
  document_id?: string
  session_id?: string
  storage_path?: string
  image_url?: string
  filename?: string
}

interface StructuredDocumentJson {
  doc_type: 'prescription' | 'lab_report' | 'discharge_summary' | 'other'
  date_on_document: string
  diagnoses: string[]
  medications: {
    name: string
    dose: string
    frequency: string
  }[]
  lab_results: {
    test: string
    value: string
    unit: string
    reference_range: string
    flag: 'normal' | 'high' | 'low'
  }[]
  doctor_notes?: string
  hospital_name?: string
}

function generateMockOcrExtraction(filename?: string): StructuredDocumentJson {
  const lowerName = (filename || '').toLowerCase()

  // Variety of realistic mock extracts based on type
  if (lowerName.includes('lab') || lowerName.includes('blood') || lowerName.includes('test')) {
    return {
      doc_type: 'lab_report',
      date_on_document: '2026-08-28',
      hospital_name: 'Apex Diagnostic & Pathology Center',
      diagnoses: ['Impaired Fasting Glycemia', 'Mild Hypercholesterolemia'],
      medications: [],
      lab_results: [
        {
          test: 'HbA1c (Glycated Hemoglobin)',
          value: '7.3',
          unit: '%',
          reference_range: '< 5.7',
          flag: 'high',
        },
        {
          test: 'Fasting Blood Glucose',
          value: '136',
          unit: 'mg/dL',
          reference_range: '70 - 100',
          flag: 'high',
        },
        {
          test: 'Postprandial Blood Glucose',
          value: '184',
          unit: 'mg/dL',
          reference_range: '< 140',
          flag: 'high',
        },
        {
          test: 'Total Serum Cholesterol',
          value: '215',
          unit: 'mg/dL',
          reference_range: '< 200',
          flag: 'high',
        },
        {
          test: 'Serum Creatinine',
          value: '0.9',
          unit: 'mg/dL',
          reference_range: '0.6 - 1.2',
          flag: 'normal',
        },
      ],
      doctor_notes: 'Recommend glycemic control and lifestyle modification. Repeat lipid panel in 3 months.',
    }
  }

  // Default: Prescription
  return {
    doc_type: 'prescription',
    date_on_document: '2026-08-20',
    hospital_name: 'City General Hospital OPD',
    diagnoses: [
      'Type 2 Diabetes Mellitus',
      'Essential Hypertension (Stage 1)',
      'Upper Respiratory Tract Infection',
    ],
    medications: [
      {
        name: 'Metformin Hydrochloride',
        dose: '500 mg',
        frequency: '1 tablet twice daily after meals (1-0-1)',
      },
      {
        name: 'Telmisartan',
        dose: '40 mg',
        frequency: '1 tablet once daily morning (1-0-0)',
      },
      {
        name: 'Amoxicillin + Clavulanic Acid',
        dose: '625 mg',
        frequency: '1 tablet twice daily for 5 days',
      },
      {
        name: 'Pantoprazole',
        dose: '40 mg',
        frequency: '1 tablet empty stomach in morning',
      },
    ],
    lab_results: [
      {
        test: 'Random Blood Sugar (Fingerstick)',
        value: '162',
        unit: 'mg/dL',
        reference_range: '80 - 140',
        flag: 'high',
      },
      {
        test: 'Blood Pressure (Seated)',
        value: '138/88',
        unit: 'mmHg',
        reference_range: '< 120/80',
        flag: 'high',
      },
    ],
    doctor_notes: 'Diet advice: low sodium, low carbohydrate. Review after 10 days with fasting blood sugar report.',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: DigitizeRequest = await req.json()
    const { filename } = payload

    // Mock digitization delay to simulate OCR processing
    await new Promise((resolve) => setTimeout(resolve, 600))

    const result = generateMockOcrExtraction(filename)

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      status: 200,
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal digitize error' }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      status: 500,
    })
  }
})
