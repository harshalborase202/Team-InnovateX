import React, { useState, useRef, useCallback } from 'react'

interface RxMedicine {
  id: string
  name: string
  dose: string
  freq: string
  duration: string
  instruction: string
}

const FREQ_OPTIONS = [
  { value: 'OD', label: 'OD (Once Daily)' },
  { value: 'BD', label: 'BD (Twice Daily)' },
  { value: 'TDS', label: 'TDS (3× Daily)' },
  { value: 'QID', label: 'QID (4× Daily)' },
  { value: 'SOS', label: 'SOS (As needed)' },
  { value: 'HS', label: 'HS (At Bedtime)' },
]

const DURATION_OPTIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '1 month', 'Ongoing']

const INSTRUCTION_OPTIONS = [
  'After food',
  'Before food',
  'With warm water',
  'With milk',
  'Empty stomach',
  'As directed',
]

const COMMON_MEDICINES = [
  'Tab. Paracetamol 500mg',
  'Tab. Ibuprofen 400mg',
  'Tab. Amoxicillin 500mg',
  'Tab. Azithromycin 500mg',
  'Tab. Metformin 500mg',
  'Tab. Atorvastatin 10mg',
  'Tab. Pantoprazole 40mg',
  'Syr. Amoxicillin 125mg/5ml',
  'Tab. Cetirizine 10mg',
  'Tab. Montelukast 10mg',
  'Cap. Omeprazole 20mg',
  'Tab. Metronidazole 400mg',
]

const genId = () => Math.random().toString(36).slice(2, 9)

const emptyMed = (): RxMedicine => ({
  id: genId(),
  name: '',
  dose: '',
  freq: 'BD',
  duration: '5 days',
  instruction: 'After food',
})

interface RxPadProps {
  patientName: string
  patientId: string
  sessionId: string
  department: string
  onSave: (rxText: string) => void
  onClose: () => void
}

export const RxPad: React.FC<RxPadProps> = ({
  patientName,
  patientId,
  sessionId,
  department,
  onSave,
  onClose,
}) => {
  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const [medicines, setMedicines] = useState<RxMedicine[]>([emptyMed()])
  const [diagnosis, setDiagnosis] = useState('')
  const [advice, setAdvice] = useState('')
  const [followUp, setFollowUp] = useState('1 week')
  const [doctorName, setDoctorName] = useState('Dr. ')
  const [showAutocomplete, setShowAutocomplete] = useState<string | null>(null) // med id
  const rxRef = useRef<HTMLDivElement>(null)

  const updateMed = useCallback(
    (id: string, field: keyof RxMedicine, value: string) => {
      setMedicines((prev) =>
        prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
      )
    },
    []
  )

  const addMed = () => setMedicines((prev) => [...prev, emptyMed()])
  const removeMed = (id: string) =>
    setMedicines((prev) => (prev.length > 1 ? prev.filter((m) => m.id !== id) : prev))

  const filteredSuggestions = (medId: string) => {
    const med = medicines.find((m) => m.id === medId)
    if (!med || !med.name || med.name.length < 2) return []
    const q = med.name.toLowerCase()
    return COMMON_MEDICINES.filter((m) => m.toLowerCase().includes(q)).slice(0, 5)
  }

  const generateRxText = (): string => {
    const lines = [
      `PRESCRIPTION`,
      `Date: ${today} | Patient: ${patientName} (${patientId})`,
      `Department: ${department}`,
      `Physician: ${doctorName}`,
      `─────────────────────────────────────`,
      `Diagnosis: ${diagnosis || '(Not specified)'}`,
      ``,
      `Rx:`,
      ...medicines
        .filter((m) => m.name.trim())
        .map(
          (m, i) =>
            `${i + 1}. ${m.name}${m.dose ? ' ' + m.dose : ''} — ${m.freq} × ${m.duration} (${m.instruction})`
        ),
      ``,
      `Advice: ${advice || '—'}`,
      `Follow-up: ${followUp}`,
      ``,
      `Issued by: ${doctorName}`,
      `Session ID: ${sessionId}`,
    ]
    return lines.join('\n')
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=680,height=900')
    if (!printWindow) return

    const medsHtml = medicines
      .filter((m) => m.name.trim())
      .map(
        (m, i) => `
        <tr>
          <td class="num">${i + 1}.</td>
          <td class="med-name">${m.name}${m.dose ? ' <span class="dose">' + m.dose + '</span>' : ''}</td>
          <td class="med-freq">${m.freq}</td>
          <td class="med-dur">${m.duration}</td>
          <td class="med-instr">${m.instruction}</td>
        </tr>`
      )
      .join('')

    printWindow.document.write(`
      <!DOCTYPE html><html>
      <head>
        <meta charset="utf-8" />
        <title>Prescription – ${patientName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', sans-serif; padding: 24px; background: #fff; color: #0f172a; }
          .rx-page { max-width: 640px; margin: 0 auto; border: 2px solid #0d9488; border-radius: 12px; overflow: hidden; }
          .rx-header { background: linear-gradient(135deg, #0f766e, #0d9488); color: white; padding: 20px 28px; }
          .rx-header h1 { font-size: 22px; font-weight: 900; }
          .rx-header p { font-size: 11px; opacity: 0.8; margin-top: 2px; letter-spacing: 1px; text-transform: uppercase; }
          .rx-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 16px 28px; background: #f0fdfa; border-bottom: 1px solid #ccfbf1; font-size: 12px; }
          .rx-meta span { color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; }
          .rx-meta strong { display: block; color: #0f172a; font-size: 13px; font-weight: 700; }
          .section { padding: 16px 28px; border-bottom: 1px solid #f1f5f9; }
          .section-title { font-size: 10px; font-weight: 800; color: #0d9488; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px; }
          .diagnosis-text { font-size: 15px; font-weight: 700; color: #0f172a; }
          .rx-symbol { font-size: 36px; font-weight: 900; color: #0d9488; font-style: italic; margin-bottom: 8px; display: block; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { text-align: left; color: #94a3b8; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
          td { padding: 8px 6px; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
          td.num { color: #94a3b8; font-weight: 700; width: 20px; }
          td.med-name { font-weight: 700; color: #0f172a; }
          .dose { color: #0d9488; font-weight: 600; }
          td.med-freq { font-weight: 700; color: #0f766e; }
          td.med-dur { color: #475569; }
          td.med-instr { color: #64748b; font-style: italic; }
          .rx-footer { padding: 16px 28px; display: flex; justify-content: space-between; align-items: flex-end; }
          .sign-block { text-align: right; }
          .sign-line { border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 11px; font-weight: 700; color: #475569; margin-top: 32px; }
          .rx-brand { font-size: 9px; color: #94a3b8; letter-spacing: 2px; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="rx-page">
          <div class="rx-header">
            <h1>HealthNexa Hospital</h1>
            <p>Medical Prescription — ${today}</p>
          </div>
          <div class="rx-meta">
            <div><span>Patient Name</span><strong>${patientName}</strong></div>
            <div><span>Patient ID / ABHA</span><strong>${patientId || '—'}</strong></div>
            <div><span>Department</span><strong>${department}</strong></div>
            <div><span>Session ID</span><strong>${sessionId.slice(0, 8).toUpperCase()}</strong></div>
          </div>
          <div class="section">
            <div class="section-title">Diagnosis / Chief Complaint</div>
            <div class="diagnosis-text">${diagnosis || '—'}</div>
          </div>
          <div class="section">
            <span class="rx-symbol">℞</span>
            <table>
              <thead><tr>
                <th>#</th><th>Medicine</th><th>Freq.</th><th>Duration</th><th>Instructions</th>
              </tr></thead>
              <tbody>${medsHtml}</tbody>
            </table>
          </div>
          ${advice ? `<div class="section"><div class="section-title">Advice &amp; Instructions</div><div class="diagnosis-text">${advice}</div></div>` : ''}
          <div class="section"><div class="section-title">Follow-up</div><div class="diagnosis-text">${followUp}</div></div>
          <div class="rx-footer">
            <div class="rx-brand">Powered by HealthNexa AI Kiosk</div>
            <div class="sign-block">
              <div class="sign-line">${doctorName}<br/>Signature &amp; Stamp</div>
            </div>
          </div>
        </div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body></html>
    `)
    printWindow.document.close()
  }

  const handleSave = () => {
    const text = generateRxText()
    onSave(text)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(8px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Prescription Pad"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-teal-800 to-teal-600 text-white">
          <div>
            <div className="font-black text-lg tracking-tight">℞ Prescription Pad</div>
            <div className="text-xs text-teal-200 font-semibold">{patientName} · {today}</div>
          </div>
          <button
            onClick={onClose}
            className="text-teal-200 hover:text-white font-bold text-2xl leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable form body */}
        <div ref={rxRef} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Physician Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Physician Name
              </label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-semibold focus:border-teal-600 focus:outline-none"
                placeholder="Dr. Name & Qualification"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Diagnosis / Chief Complaint
              </label>
              <input
                type="text"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-semibold focus:border-teal-600 focus:outline-none"
                placeholder="e.g. Viral URTI, Hypertension..."
              />
            </div>
          </div>

          {/* Medicines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-teal-800 uppercase tracking-widest">
                ℞ Medicines
              </span>
              <button
                type="button"
                onClick={addMed}
                className="text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
              >
                + Add Medicine
              </button>
            </div>

            <div className="space-y-3">
              {medicines.map((med, idx) => (
                <div
                  key={med.id}
                  className="bg-slate-50 rounded-2xl p-3 border border-slate-200 relative"
                >
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                    {medicines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMed(med.id)}
                        className="text-red-400 hover:text-red-600 font-bold text-sm cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    {/* Medicine name with autocomplete */}
                    <div className="relative sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-400 mb-1">Medicine Name</label>
                      <input
                        type="text"
                        value={med.name}
                        onChange={(e) => {
                          updateMed(med.id, 'name', e.target.value)
                          setShowAutocomplete(med.id)
                        }}
                        onFocus={() => setShowAutocomplete(med.id)}
                        onBlur={() => setTimeout(() => setShowAutocomplete(null), 150)}
                        placeholder="Start typing medicine name..."
                        className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-semibold focus:border-teal-600 focus:outline-none"
                      />
                      {showAutocomplete === med.id && filteredSuggestions(med.id).length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border-2 border-teal-200 rounded-xl shadow-xl overflow-hidden">
                          {filteredSuggestions(med.id).map((sug) => (
                            <button
                              key={sug}
                              type="button"
                              onMouseDown={() => {
                                updateMed(med.id, 'name', sug)
                                setShowAutocomplete(null)
                              }}
                              className="w-full text-left px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-teal-50 transition-colors cursor-pointer"
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Dose */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Dose</label>
                      <input
                        type="text"
                        value={med.dose}
                        onChange={(e) => updateMed(med.id, 'dose', e.target.value)}
                        placeholder="e.g. 500mg"
                        className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-semibold focus:border-teal-600 focus:outline-none"
                      />
                    </div>

                    {/* Frequency */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Frequency</label>
                      <select
                        value={med.freq}
                        onChange={(e) => updateMed(med.id, 'freq', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-semibold focus:border-teal-600 focus:outline-none bg-white cursor-pointer"
                      >
                        {FREQ_OPTIONS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Duration */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Duration</label>
                      <select
                        value={med.duration}
                        onChange={(e) => updateMed(med.id, 'duration', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-semibold focus:border-teal-600 focus:outline-none bg-white cursor-pointer"
                      >
                        {DURATION_OPTIONS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    {/* Instruction */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Instructions</label>
                      <select
                        value={med.instruction}
                        onChange={(e) => updateMed(med.id, 'instruction', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-semibold focus:border-teal-600 focus:outline-none bg-white cursor-pointer"
                      >
                        {INSTRUCTION_OPTIONS.map((ins) => (
                          <option key={ins} value={ins}>{ins}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Advice & Follow-up */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Advice & Instructions
              </label>
              <textarea
                rows={3}
                value={advice}
                onChange={(e) => setAdvice(e.target.value)}
                placeholder="Dietary advice, activity restrictions, etc."
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-semibold focus:border-teal-600 focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Follow-up In
              </label>
              <select
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-900 text-sm font-semibold focus:border-teal-600 focus:outline-none bg-white cursor-pointer"
              >
                {['3 days', '5 days', '1 week', '2 weeks', '1 month', '3 months', 'As needed'].map(
                  (f) => <option key={f} value={f}>{f}</option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 p-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-100 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-bold text-sm cursor-pointer transition-colors"
          >
            💾 Save to Session
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-sm shadow-md cursor-pointer transition-colors"
          >
            🖨️ Print Prescription
          </button>
        </div>
      </div>
    </div>
  )
}
