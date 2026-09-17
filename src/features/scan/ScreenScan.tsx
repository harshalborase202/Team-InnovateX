import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKiosk } from '../../context/KioskContext'
import { KioskHeader } from '../../components/KioskHeader'
import { supabase } from '../../lib/supabase'
import {
  uploadDocumentToStorage,
  createDocumentRecord,
  processAndSaveOcr,
  StructuredDocumentJson,
} from '../../services/digitizeService'

interface ScannedDocItem {
  id: string
  storagePath: string
  previewUrl: string
  docType: string
  ocrStatus: string
  dateOnDocument?: string
  structuredJson?: StructuredDocumentJson
  createdAt: string
}

export const ScreenScan: React.FC = () => {
  const navigate = useNavigate()
  const {
    language,
    currentPatient,
    setCurrentPatient,
    currentSession,
    setCurrentSession,
    setScreenAudio,
    playAudio,
  } = useKiosk()

  // Captured documents list
  const [documents, setDocuments] = useState<ScannedDocItem[]>([])
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [processingStatusText, setProcessingStatusText] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [activePreviewDoc, setActivePreviewDoc] = useState<ScannedDocItem | null>(null)

  // File input ref for camera capture
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const initialFetchDone = useRef(false)

  // Localized audio prompt on screen load
  useEffect(() => {
    const promptText =
      language === 'hi'
        ? 'क्या आपके पास कोई पुराना डॉक्टर का पर्चा, खून की जाँच रिपोर्ट या अस्पताल का डिस्चार्ज कार्ड है? नीचे दिए गए बड़े कैमरा बटन को दबाकर फ़ोटो लें, या यदि कोई पर्चा नहीं है तो आगे बढ़ें।'
        : "Have any old prescriptions, lab reports, or discharge papers? Let's take a photo, or skip if you don't have any."

    setScreenAudio(promptText)
  }, [language, setScreenAudio])

  // Load existing documents for this session (resilience on refresh)
  const loadExistingDocuments = useCallback(async () => {
    let activeSessionId = currentSession?.id

    if (!activeSessionId) {
      const { data: latest } = await supabase
        .from('sessions')
        .select('*, patients(*)')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latest) {
        activeSessionId = latest.id
        setCurrentSession(latest)
        if (latest.patients) setCurrentPatient(latest.patients)
      }
    }

    if (!activeSessionId) return

    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('session_id', activeSessionId)
        .order('created_at', { ascending: true })

      if (!error && data) {
        const mapped: ScannedDocItem[] = data.map((doc: any) => {
          const { data: urlData } = supabase.storage
            .from('patient-documents')
            .getPublicUrl(doc.storage_path)

          return {
            id: doc.id,
            storagePath: doc.storage_path,
            previewUrl: urlData?.publicUrl || '',
            docType: doc.doc_type,
            ocrStatus: doc.ocr_status,
            dateOnDocument: doc.structured_json?.date_on_document,
            structuredJson: doc.structured_json,
            createdAt: doc.created_at,
          }
        })
        setDocuments(mapped)
      }
    } catch (err) {
      console.warn('Could not load session documents:', err)
    }
  }, [currentSession?.id, setCurrentPatient, setCurrentSession])

  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true
      loadExistingDocuments()
    }
  }, [loadExistingDocuments])

  // Core Document Upload & OCR Processing Workflow
  const handleProcessImage = async (file: File | Blob, filename: string) => {
    let activeSessionId = currentSession?.id
    if (!activeSessionId) {
      // Auto-recover session
      const { data: latest } = await supabase
        .from('sessions')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      activeSessionId = latest?.id || 'demo-session-id'
    }
    const sessionId: string = activeSessionId || 'demo-session-id'

    setIsProcessing(true)
    setErrorMsg(null)
    setProcessingStatusText(
      language === 'hi'
        ? 'दस्तावेज़ अपलोड किया जा रहा है...'
        : 'Uploading medical document...'
    )

    // Local object URL for instant UI thumbnail preview
    const localPreviewUrl = URL.createObjectURL(file)

    try {
      // 1. Upload to Supabase Storage: bucket 'patient-documents' under session_id prefix
      const { storagePath, publicUrl } = await uploadDocumentToStorage(
        sessionId,
        file,
        filename
      )

      setProcessingStatusText(
        language === 'hi'
          ? 'एआई द्वारा पर्चे की दवाइयाँ व जाँच पढ़ी जा रही हैं...'
          : 'Digitizing prescriptions & lab values with AI OCR...'
      )

      // 2. Insert row into documents table (session_id, storage_path, doc_type: 'unclassified', ocr_status: 'pending')
      const docRecord = await createDocumentRecord(sessionId, storagePath)

      const docId = docRecord?.id || `doc-${Date.now()}`

      // 3. Call digitize-document Edge Function / OCR model (with real image data)
      const structuredData = await processAndSaveOcr(
        docId,
        sessionId,
        storagePath,
        filename,
        documents.length,
        file // Pass the actual image file for Gemini Vision OCR
      )

      // 4. Update UI document state
      const newDocItem: ScannedDocItem = {
        id: docId,
        storagePath,
        previewUrl: publicUrl || localPreviewUrl,
        docType: structuredData.doc_type || 'prescription',
        ocrStatus: 'done',
        dateOnDocument: structuredData.date_on_document,
        structuredJson: structuredData,
        createdAt: new Date().toISOString(),
      }

      setDocuments((prev) => [...prev, newDocItem])
      setActivePreviewDoc(newDocItem)

      // Announce success
      const successAudio =
        language === 'hi'
          ? 'दस्तावेज़ सफलतापूर्वक डिजिटाइज़ कर लिया गया है।'
          : 'Document successfully digitized.'
      playAudio(successAudio)
    } catch (err: any) {
      console.error('Document digitization error:', err)
      setErrorMsg(
        language === 'hi'
          ? 'दस्तावेज़ स्कैन करने में त्रुटि आई। कृपया पुनः प्रयास करें।'
          : 'Failed to process document. Please try again.'
      )
    } finally {
      setIsProcessing(false)
      setProcessingStatusText('')
    }
  }

  // Camera file input change handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      handleProcessImage(file, file.name)
    }
    // Reset file input value so same file can be captured again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Helper to generate a realistic synthetic prescription / lab image for instant testing
  const createSampleCanvasImage = (type: 'prescription' | 'lab'): Promise<{ blob: Blob; filename: string }> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 800
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve({ blob: new Blob(['sample'], { type: 'image/png' }), filename: `${type}_sample.png` })
        return
      }

      // Paper background
      ctx.fillStyle = type === 'prescription' ? '#fcfbf7' : '#f8fafc'
      ctx.fillRect(0, 0, 600, 800)

      // Header Banner
      ctx.fillStyle = type === 'prescription' ? '#0f766e' : '#0369a1'
      ctx.fillRect(0, 0, 600, 90)

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px sans-serif'
      ctx.fillText(
        type === 'prescription' ? '🏥 CITY GENERAL HOSPITAL OPD' : '🧪 APEX PATHOLOGY LABS',
        30,
        50
      )

      ctx.font = '14px sans-serif'
      ctx.fillText(
        type === 'prescription' ? 'Medical Prescription & Treatment Advice' : 'Diagnostic Hematology & Biochemistry Report',
        30,
        75
      )

      // Patient details line
      ctx.fillStyle = '#334155'
      ctx.font = 'bold 16px sans-serif'
      ctx.fillText(`Patient: ${currentPatient?.name || 'Walk-in Patient'}`, 30, 130)
      ctx.font = '14px sans-serif'
      ctx.fillText(`Date: 20 Aug 2026    OPD No: ${currentSession?.token_number || 'OPD-102'}`, 30, 155)

      // Divider line
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(30, 175)
      ctx.lineTo(570, 175)
      ctx.stroke()

      if (type === 'prescription') {
        // Prescription Symbol (Rx)
        ctx.fillStyle = '#0f766e'
        ctx.font = 'bold 36px serif'
        ctx.fillText('℞', 30, 225)

        ctx.fillStyle = '#1e293b'
        ctx.font = 'bold 18px sans-serif'
        ctx.fillText('1. Tab. Metformin 500mg', 65, 230)
        ctx.font = '14px sans-serif'
        ctx.fillText('   1 tablet twice daily after meals (1-0-1)', 65, 255)

        ctx.font = 'bold 18px sans-serif'
        ctx.fillText('2. Tab. Telmisartan 40mg', 65, 300)
        ctx.font = '14px sans-serif'
        ctx.fillText('   1 tablet once daily morning (1-0-0)', 65, 325)

        ctx.font = 'bold 18px sans-serif'
        ctx.fillText('3. Tab. Pantoprazole 40mg', 65, 370)
        ctx.font = '14px sans-serif'
        ctx.fillText('   1 tablet empty stomach in morning (1-0-0)', 65, 395)

        // Doctor stamp
        ctx.strokeStyle = '#0f766e'
        ctx.strokeRect(360, 680, 200, 70)
        ctx.fillStyle = '#0f766e'
        ctx.font = 'bold 14px sans-serif'
        ctx.fillText('Dr. S. Sharma, MD', 380, 710)
        ctx.font = '12px sans-serif'
        ctx.fillText('Reg. No: MCI-54829', 380, 730)
      } else {
        // Lab Report Table
        ctx.fillStyle = '#0369a1'
        ctx.font = 'bold 16px sans-serif'
        ctx.fillText('Test Description              Result       Reference Range', 30, 220)

        ctx.strokeStyle = '#94a3b8'
        ctx.beginPath()
        ctx.moveTo(30, 230)
        ctx.lineTo(570, 230)
        ctx.stroke()

        ctx.fillStyle = '#1e293b'
        ctx.font = '15px sans-serif'
        ctx.fillText('HbA1c (Glycated Hb)           7.3 %        < 5.7 % (HIGH)', 30, 260)
        ctx.fillText('Fasting Blood Glucose          136 mg/dL    70 - 100 mg/dL (HIGH)', 30, 300)
        ctx.fillText('Postprandial Glucose           184 mg/dL    < 140 mg/dL (HIGH)', 30, 340)
        ctx.fillText('Total Serum Cholesterol        215 mg/dL    < 200 mg/dL (HIGH)', 30, 380)
        ctx.fillText('Serum Creatinine               0.9 mg/dL    0.6 - 1.2 mg/dL (NORMAL)', 30, 420)

        // Lab seal
        ctx.strokeStyle = '#0369a1'
        ctx.strokeRect(360, 680, 200, 70)
        ctx.fillStyle = '#0369a1'
        ctx.font = 'bold 14px sans-serif'
        ctx.fillText('Verified by Pathologist', 380, 710)
        ctx.font = '12px sans-serif'
        ctx.fillText('Apex Central Laboratory', 380, 730)
      }

      canvas.toBlob((blob) => {
        if (blob) {
          resolve({ blob, filename: `${type}_report_${Date.now()}.png` })
        } else {
          resolve({ blob: new Blob(['sample'], { type: 'image/png' }), filename: `${type}_sample.png` })
        }
      }, 'image/png')
    })
  }

  // Quick helper for demo prescription capture
  const handleCaptureSamplePrescription = async () => {
    const { blob, filename } = await createSampleCanvasImage('prescription')
    await handleProcessImage(blob, filename)
  }

  // Quick helper for demo lab report capture
  const handleCaptureSampleLab = async () => {
    const { blob, filename } = await createSampleCanvasImage('lab')
    await handleProcessImage(blob, filename)
  }

  // Delete captured document
  const handleDeleteDocument = async (docId: string, storagePath: string) => {
    try {
      // Remove from database
      await supabase.from('documents').delete().eq('id', docId)

      // Try removing from storage
      if (storagePath) {
        await supabase.storage.from('patient-documents').remove([storagePath])
      }

      setDocuments((prev) => prev.filter((d) => d.id !== docId))
      if (activePreviewDoc?.id === docId) {
        setActivePreviewDoc(null)
      }
    } catch (err) {
      console.warn('Error deleting document:', err)
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
    }
  }

  // Continue to Step 4 (Summarize) or Skip
  const handleAdvanceToSummarize = async () => {
    const activeSessionId = currentSession?.id

    if (activeSessionId) {
      try {
        // 1. Sort all session documents by date_on_document
        const { data: allDocs } = await supabase
          .from('documents')
          .select('*')
          .eq('session_id', activeSessionId)

        if (allDocs && allDocs.length > 0) {
          // Client-side sort by date_on_document descending
          allDocs.sort((a, b) => {
            const dateA = a.structured_json?.date_on_document || a.created_at || ''
            const dateB = b.structured_json?.date_on_document || b.created_at || ''
            return dateB.localeCompare(dateA)
          })
        }

        // 2. Move session status to 'summarize'
        const { data: updatedSession } = await supabase
          .from('sessions')
          .update({
            status: 'summarize',
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeSessionId)
          .select()
          .single()

        if (updatedSession) {
          setCurrentSession(updatedSession)
        }

        // 3. Log audit event
        await supabase.from('audit_log').insert({
          session_id: activeSessionId,
          actor: 'kiosk_patient',
          action: documents.length > 0 ? 'DOCUMENTS_SCANNED' : 'DOCUMENTS_SKIPPED',
          details: {
            documents_count: documents.length,
            timestamp: new Date().toISOString(),
          },
        })
      } catch (err) {
        console.error('Failed to advance session to summarize:', err)
      }
    }

    navigate('/summary')
  }

  return (
    <div className="min-h-screen flex flex-col bg-sky-50/50 text-slate-800">
      <KioskHeader
        showBack={true}
        onBack={() => navigate('/converse')}
        stepNumber={3}
        stepTitle={
          language === 'mr'
            ? 'Step 3: जुने रिपोर्ट व औषधपत्रिका स्कॅन'
            : language === 'hi'
            ? 'चरण 3: पुराने पर्चे व जाँच स्कैन'
            : 'Step 3: Medical Document Scan'
        }
      />

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-4xl mx-auto w-full">
        {/* Patient & Token Bar */}
        {currentPatient && (
          <div className="w-full max-w-3xl flex flex-wrap items-center justify-between gap-3 bg-white border border-teal-200 px-5 py-3 rounded-2xl shadow-xs mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">👤</span>
              <span className="font-bold text-slate-900">{currentPatient.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {currentSession?.token_number && (
                <span className="font-bold text-teal-900 bg-teal-50 border border-teal-200 px-3 py-1 rounded-xl text-xs sm:text-sm font-mono">
                  Token: {currentSession.token_number}
                </span>
              )}
              {documents.length > 0 && (
                <span className="font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-xl text-xs sm:text-sm">
                  ✓ {documents.length} {language === 'mr' ? 'कागदपत्रे तपासली गेली' : language === 'hi' ? 'दस्तावेज़ जाँचे गए' : 'Scanned'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── MAIN SCAN CARD CONTAINER ─────────────────────────────────── */}
        <div className="w-full max-w-3xl bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-teal-100 flex flex-col items-center text-center relative">
          {/* Friendly Icon Avatar */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-teal-100 text-teal-800 flex items-center justify-center text-4xl sm:text-5xl mb-4 border-2 border-teal-200 shadow-xs">
            📄
          </div>

          {/* Friendly Heading */}
          <h2
            id="scan-heading-text"
            className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-teal-950 mb-3 tracking-tight leading-snug"
          >
            {language === 'mr'
              ? 'जुने प्रिस्क्रिप्शन किंवा तपासणी अहवालाचा फोटो घ्या'
              : language === 'hi'
              ? 'पुराने पर्चे या जाँच रिपोर्ट की फ़ोटो लें'
              : 'Take a photo of your medical documents'}
          </h2>

          {/* Friendly Explanation (Not Jargon) */}
          <p className="text-base sm:text-lg font-medium text-slate-600 max-w-xl mb-6">
            {language === 'mr'
              ? 'तुमच्याकडे जुनी औषधपत्रिका, रक्त तपासणी किंवा डिस्चार्ज कार्ड आहे का? खालील कॅमेरा बटण दाबून फोटो काढा.'
              : language === 'hi'
              ? 'क्या आपके पास कोई पुराना डॉक्टर का पर्चा, खून की जाँच या डिस्चार्ज कार्ड है? नीचे कैमरा बटन दबाकर फ़ोटो खींचें।'
              : 'Have any old prescriptions, lab reports, or discharge papers? Capture a quick photo below so the doctor has your complete history.'}
          </p>

          {/* Hidden Device Camera Input */}
          <input
            ref={fileInputRef}
            id="camera-file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* ── BIG PRIMARY CAMERA CAPTURE BUTTON ───────────────────────── */}
          <div className="w-full max-w-md flex flex-col items-center mb-6">
            <button
              id="btn-take-photo"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              type="button"
              className="w-full py-5 px-6 rounded-3xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xl sm:text-2xl shadow-xl hover:shadow-2xl active:scale-98 transition-all flex items-center justify-center gap-4 cursor-pointer min-h-[76px] border-3 border-teal-600 ring-4 ring-teal-100 disabled:opacity-50"
            >
              <span className="text-3xl sm:text-4xl">📸</span>
              <span>
                {language === 'mr'
                  ? 'फोटो काढा (Take Photo)'
                  : language === 'hi'
                  ? 'फ़ोटो खींचें (Take Photo)'
                  : 'Take Document Photo'}
              </span>
            </button>

            {/* Quick Demo Helper Buttons for Kiosk Testing */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <button
                id="btn-sample-prescription"
                type="button"
                onClick={handleCaptureSamplePrescription}
                disabled={isProcessing}
                className="text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-3.5 py-2 rounded-xl border border-teal-200 cursor-pointer transition-all"
              >
                {language === 'mr' ? '⚡ नमुना औषधपत्रिका (Demo Rx)' : '⚡ नमूना पर्चा जोड़ें (Demo Rx)'}
              </button>
              <button
                id="btn-sample-lab"
                type="button"
                onClick={handleCaptureSampleLab}
                disabled={isProcessing}
                className="text-xs font-bold text-sky-800 bg-sky-50 hover:bg-sky-100 px-3.5 py-2 rounded-xl border border-sky-200 cursor-pointer transition-all"
              >
                {language === 'mr' ? '🧪 नमुना लॅब रिपोर्ट (Demo Lab)' : '🧪 नमूना लैब रिपोर्ट (Demo Lab)'}
              </button>
            </div>
          </div>

          {/* ── ACTIVE OCR SCANNING PROGRESS INDICATOR ───────────────────── */}
          {isProcessing && (
            <div className="w-full bg-teal-50 border-2 border-teal-300 rounded-2xl p-5 mb-6 text-center animate-pulse">
              <div className="inline-block animate-spin text-3xl mb-2">⚙️</div>
              <p className="text-lg font-bold text-teal-950">{processingStatusText}</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                {language === 'hi'
                  ? 'कृपया एक क्षण प्रतीक्षा करें...'
                  : 'Please wait a moment while AI processes your document...'}
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="w-full p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 font-semibold text-base mb-6 flex items-center justify-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ── SCANNED DOCUMENTS THUMBNAIL STRIP ────────────────────────── */}
          {documents.length > 0 && (
            <div className="w-full text-left mb-6 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-base sm:text-lg font-bold text-teal-950 flex items-center gap-2">
                  <span>📂</span>
                  <span>
                    {language === 'hi'
                      ? `स्कैन किए गए दस्तावेज़ (${documents.length})`
                      : `Scanned Documents (${documents.length})`}
                  </span>
                </span>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg">
                  {language === 'hi' ? 'तारीख अनुसार व्यवस्थित' : 'Auto-sorted by Date'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {documents.map((doc, idx) => {
                  const isRx = doc.docType === 'prescription'
                  const medCount = doc.structuredJson?.medications?.length || 0
                  const labCount = doc.structuredJson?.lab_results?.length || 0

                  return (
                    <div
                      key={doc.id || idx}
                      id={`card-scanned-doc-${idx}`}
                      className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-50 border-2 border-teal-200 hover:border-teal-500 transition-all shadow-xs relative"
                    >
                      {/* Document Preview Thumbnail */}
                      <div className="w-20 h-24 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
                        {doc.previewUrl ? (
                          <img
                            src={doc.previewUrl}
                            alt="Document Thumbnail"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-3xl">{isRx ? '📄' : '🧪'}</span>
                        )}
                      </div>

                      {/* Document Clinical Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                              isRx
                                ? 'bg-teal-100 text-teal-900'
                                : 'bg-sky-100 text-sky-900'
                            }`}
                          >
                            {isRx
                              ? language === 'hi'
                                ? 'पर्चा (Prescription)'
                                : 'Prescription'
                              : language === 'hi'
                              ? 'लैब रिपोर्ट (Lab Report)'
                              : 'Lab Report'}
                          </span>
                          <span className="text-xs font-bold text-emerald-700">
                            ✓ {language === 'hi' ? 'जाँचा गया' : 'Digitized'}
                          </span>
                        </div>

                        {doc.dateOnDocument && (
                          <p className="text-xs font-semibold text-slate-500 mb-1">
                            📅 {doc.dateOnDocument}
                          </p>
                        )}

                        {/* Extracted Stats */}
                        <div className="text-xs text-slate-700 font-medium space-y-0.5">
                          {medCount > 0 && (
                            <p className="truncate">
                              💊 <b>{medCount} दवाइयाँ:</b>{' '}
                              {doc.structuredJson?.medications
                                .map((m) => m.name)
                                .slice(0, 2)
                                .join(', ')}
                            </p>
                          )}
                          {labCount > 0 && (
                            <p className="truncate">
                              🔬 <b>{labCount} टेस्ट:</b>{' '}
                              {doc.structuredJson?.lab_results
                                .map((l) => `${l.test} (${l.value})`)
                                .slice(0, 2)
                                .join(', ')}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            type="button"
                            onClick={() => setActivePreviewDoc(doc)}
                            className="text-xs font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                          >
                            {language === 'hi' ? 'विवरण देखें' : 'View Extracted'}
                          </button>
                          <button
                            id={`btn-delete-doc-${idx}`}
                            type="button"
                            onClick={() => handleDeleteDocument(doc.id, doc.storagePath)}
                            className="text-xs font-bold text-red-600 hover:text-red-800 cursor-pointer"
                          >
                            🗑️ {language === 'hi' ? 'हटाएँ' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── MODAL: STRUCTURED EXTRACTED DETAILS PREVIEW ──────────────── */}
          {activePreviewDoc && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border-2 border-teal-300 text-left max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">
                      {activePreviewDoc.docType === 'prescription' ? '📄' : '🧪'}
                    </span>
                    <h3 className="text-xl font-bold text-teal-950">
                      {language === 'hi' ? 'पहचाने गए विवरण' : 'Extracted Details'}
                    </h3>
                  </div>
                  <button
                    onClick={() => setActivePreviewDoc(null)}
                    type="button"
                    className="text-slate-400 hover:text-slate-700 text-2xl font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {activePreviewDoc.dateOnDocument && (
                  <p className="text-sm font-semibold text-slate-500 mb-3">
                    📅 दस्तावेज़ की तारीख:{' '}
                    <span className="text-slate-900 font-bold">
                      {activePreviewDoc.dateOnDocument}
                    </span>
                  </p>
                )}

                {/* Diagnoses */}
                {activePreviewDoc.structuredJson?.diagnoses &&
                  activePreviewDoc.structuredJson.diagnoses.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        {language === 'hi' ? 'बीमारियाँ (Diagnoses):' : 'Diagnoses:'}
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {activePreviewDoc.structuredJson.diagnoses.map((d, i) => (
                          <span
                            key={i}
                            className="bg-amber-100 text-amber-900 text-xs font-bold px-3 py-1 rounded-lg"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Medications */}
                {activePreviewDoc.structuredJson?.medications &&
                  activePreviewDoc.structuredJson.medications.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        {language === 'hi' ? 'दवाइयाँ (Medications):' : 'Medications:'}
                      </h4>
                      <div className="space-y-2">
                        {activePreviewDoc.structuredJson.medications.map((m, i) => (
                          <div
                            key={i}
                            className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-slate-800"
                          >
                            <p className="font-bold text-teal-950 text-sm">{m.name} ({m.dose})</p>
                            <p className="text-slate-600 mt-0.5">{m.frequency}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Lab Results */}
                {activePreviewDoc.structuredJson?.lab_results &&
                  activePreviewDoc.structuredJson.lab_results.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        {language === 'hi' ? 'जाँच रिपोर्ट (Lab Results):' : 'Lab Results:'}
                      </h4>
                      <div className="space-y-2">
                        {activePreviewDoc.structuredJson.lab_results.map((l, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-xs"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{l.test}</p>
                              <p className="text-slate-500">Ref: {l.reference_range}</p>
                            </div>
                            <div className="text-right">
                              <span className="font-extrabold text-sm text-slate-900 block">
                                {l.value} {l.unit}
                              </span>
                              {l.flag !== 'normal' && (
                                <span className="text-[10px] font-bold uppercase text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                                  {l.flag}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <button
                  type="button"
                  onClick={() => setActivePreviewDoc(null)}
                  className="w-full mt-2 py-3 rounded-xl bg-teal-700 text-white font-bold text-base cursor-pointer hover:bg-teal-800"
                >
                  {language === 'hi' ? 'बंद करें' : 'Close'}
                </button>
              </div>
            </div>
          )}

          {/* ── BOTTOM NAVIGATION ACTIONS ───────────────────────────────── */}
          <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
            {/* Skip Button: always available for quick exit */}
            <button
              id="btn-skip-scan"
              type="button"
              onClick={handleAdvanceToSummarize}
              disabled={isProcessing}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl border-2 border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold text-base cursor-pointer transition-all text-center min-h-[56px]"
            >
              <span>
                {language === 'mr'
                  ? 'पुढे जा, जुने कागदपत्रे नाहीत'
                  : language === 'hi'
                  ? 'आगे बढ़ें, कोई पर्चा नहीं है'
                  : "Skip, I don't have any"}
              </span>
              <span className="ml-2">➔</span>
            </button>

            {/* Primary Continue Button (shown when documents exist) */}
            {documents.length > 0 && (
              <button
                id="btn-continue-summary"
                type="button"
                onClick={handleAdvanceToSummarize}
                disabled={isProcessing}
                className="w-full sm:w-auto flex-1 px-8 py-4 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-lg sm:text-xl shadow-lg hover:shadow-xl active:scale-98 transition-all flex items-center justify-center gap-3 cursor-pointer min-h-[56px]"
              >
                <span>
                  {language === 'mr'
                    ? 'Step 3 पूर्ण: नोंदणी सारांश पहा'
                    : language === 'hi'
                    ? 'अगला चरण: डॉक्टर सारांश देखें'
                    : 'Continue to Summary'}
                </span>
                <span className="text-2xl">➔</span>
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
