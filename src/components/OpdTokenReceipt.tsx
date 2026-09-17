import React, { useRef } from 'react'

interface OpdTokenReceiptProps {
  tokenNumber: string
  patientName: string
  departmentName: string
  roomInfo: string
  sessionDate: string
  language: 'en' | 'hi' | 'mr' | string
  estimatedWaitMinutes?: number
  isEmergency?: boolean
  onClose: () => void
}

export const OpdTokenReceipt: React.FC<OpdTokenReceiptProps> = ({
  tokenNumber,
  patientName,
  departmentName,
  roomInfo,
  sessionDate,
  language,
  estimatedWaitMinutes,
  isEmergency,
  onClose,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const printContent = receiptRef.current
    if (!printContent) return

    const printWindow = window.open('', '_blank', 'width=420,height=650')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>OPD Token – ${tokenNumber}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Inter', sans-serif;
              background: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 16px;
            }
            .receipt {
              width: 380px;
              border: 2px solid #0d9488;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 24px rgba(0,0,0,0.12);
            }
            .receipt-header {
              background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%);
              color: white;
              padding: 20px 24px;
              text-align: center;
            }
            .hospital-name {
              font-size: 18px;
              font-weight: 900;
              letter-spacing: -0.5px;
              margin-bottom: 4px;
            }
            .receipt-title {
              font-size: 11px;
              font-weight: 600;
              letter-spacing: 3px;
              text-transform: uppercase;
              opacity: 0.85;
            }
            .token-section {
              background: #f0fdfa;
              padding: 24px;
              text-align: center;
              border-bottom: 2px dashed #99f6e4;
            }
            .token-label {
              font-size: 10px;
              font-weight: 700;
              color: #5eead4;
              letter-spacing: 3px;
              text-transform: uppercase;
              margin-bottom: 8px;
            }
            .token-number {
              font-size: 52px;
              font-weight: 900;
              color: #0f172a;
              font-family: 'Courier New', monospace;
              line-height: 1;
            }
            .details {
              padding: 20px 24px;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px 0;
              border-bottom: 1px solid #f1f5f9;
              gap: 12px;
            }
            .detail-row:last-child { border-bottom: none; }
            .detail-label {
              font-size: 11px;
              font-weight: 700;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 1px;
              flex-shrink: 0;
            }
            .detail-value {
              font-size: 13px;
              font-weight: 700;
              color: #0f172a;
              text-align: right;
            }
            .badge {
              background: #f0fdfa;
              border: 1px solid #99f6e4;
              color: #0f766e;
              padding: 4px 10px;
              border-radius: 20px;
              font-size: 11px;
              font-weight: 700;
            }
            .footer-note {
              background: #f8fafc;
              border-top: 1px dashed #e2e8f0;
              padding: 14px 24px;
              text-align: center;
            }
            .footer-note p {
              font-size: 10px;
              color: #64748b;
              font-weight: 600;
              line-height: 1.6;
            }
            .footer-branding {
              margin-top: 10px;
              font-size: 9px;
              color: #94a3b8;
              letter-spacing: 2px;
              text-transform: uppercase;
            }
            .qr-placeholder {
              width: 60px;
              height: 60px;
              border: 2px solid #e2e8f0;
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 12px;
              font-size: 28px;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const lbl = {
    title:
      language === 'mr'
        ? 'ओपीडी नोंदणी पावती'
        : language === 'hi'
        ? 'ओपीडी पंजीकरण पावती'
        : 'OPD Registration Receipt',
    tokenLabel:
      language === 'mr'
        ? 'आपला टोकन क्रमांक'
        : language === 'hi'
        ? 'आपका टोकन नंबर'
        : 'Your Token Number',
    patientLabel:
      language === 'mr' ? 'रुग्णाचे नाव' : language === 'hi' ? 'मरीज़ का नाम' : 'Patient Name',
    deptLabel:
      language === 'mr' ? 'ओपीडी विभाग' : language === 'hi' ? 'ओपीडी विभाग' : 'Department',
    roomLabel:
      language === 'mr'
        ? 'नियुक्त कक्ष'
        : language === 'hi'
        ? 'नियुक्त कमरा'
        : 'Assigned Room',
    dateLabel:
      language === 'mr' ? 'दिनांक व वेळ' : language === 'hi' ? 'दिनांक और समय' : 'Date & Time',
    waitLabel:
      language === 'mr' ? 'अंदाजित प्रतीक्षा वेळ' : language === 'hi' ? 'अनुमानित प्रतीक्षा समय' : 'Est. Wait Time',
    footerNote:
      language === 'mr'
        ? 'स्क्रीनवर आपला टोकन नंबर दिसल्यावर डॉक्टरांच्या कक्षात जा. कृपया ही पावती जपून ठेवा.'
        : language === 'hi'
        ? 'स्क्रीन पर आपका नंबर आने पर डॉक्टर के कक्ष में जाएँ। कृपया इस पर्ची को संभाल कर रखें।'
        : "Proceed to the doctor\u2019s room when your token is called on screen. Please keep this slip safe.",
    hospitalName:
      language === 'mr' ? 'आरोग्यनेक्सा दवाखाना' : language === 'hi' ? 'हेल्थनेक्सा अस्पताल' : 'HealthNexa Hospital',
    printBtn:
      language === 'mr' ? '🖨️ छापा / Print करा' : language === 'hi' ? '🖨️ प्रिंट करें' : '🖨️ Print Receipt',
    closeBtn: language === 'mr' ? 'बंद करा' : language === 'hi' ? 'बंद करें' : 'Close',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="OPD Token Receipt"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <span className="text-base font-extrabold text-teal-900">{lbl.title}</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold text-xl leading-none cursor-pointer"
            aria-label="Close receipt"
          >
            ✕
          </button>
        </div>

        {/* The actual printable receipt */}
        <div ref={receiptRef}>
          <div className="receipt" style={{ fontFamily: 'Inter, sans-serif' }}>
            {/* Header */}
            <div
              className="receipt-header"
              style={{
                background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                color: 'white',
                padding: '20px 24px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 900,
                  marginBottom: '4px',
                  letterSpacing: '-0.5px',
                }}
              >
                {lbl.hospitalName}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  opacity: 0.8,
                }}
              >
                {lbl.title}
              </div>
            </div>

            {/* Token Number Highlight */}
            <div
              style={{
                background: '#f0fdfa',
                padding: '24px',
                textAlign: 'center',
                borderBottom: '2px dashed #99f6e4',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#0d9488',
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                {lbl.tokenLabel}
              </div>
              <div
                style={{
                  fontSize: '56px',
                  fontWeight: 900,
                  color: '#0f172a',
                  fontFamily: 'Courier New, monospace',
                  lineHeight: 1,
                }}
              >
                {tokenNumber}
              </div>
            </div>

            {/* Detail Rows */}
            <div style={{ padding: '16px 24px' }}>
              {[
                { label: lbl.patientLabel, value: patientName, badge: false },
                { label: lbl.deptLabel, value: departmentName, badge: true },
                { label: lbl.roomLabel, value: roomInfo, badge: true },
                { label: lbl.dateLabel, value: sessionDate, badge: false },
                ...(estimatedWaitMinutes != null
                  ? [{
                      label: lbl.waitLabel,
                      value: isEmergency
                        ? (language === 'mr' ? '🚨 तात्काळ आवश्यक' : language === 'hi' ? '🚨 तत्काल आवश्यक' : '🚨 Urgent')
                        : `~${estimatedWaitMinutes} min`,
                      badge: true,
                    }]
                  : []),
              ].map(({ label, value, badge }) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '9px 0',
                    borderBottom: '1px solid #f1f5f9',
                    gap: '12px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      flexShrink: 0,
                    }}
                  >
                    {label}
                  </span>
                  {badge ? (
                    <span
                      style={{
                        background: '#f0fdfa',
                        border: '1px solid #99f6e4',
                        color: '#0f766e',
                        padding: '3px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      {value}
                    </span>
                  ) : (
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                      {value}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              style={{
                background: '#f8fafc',
                borderTop: '1px dashed #e2e8f0',
                padding: '14px 24px',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, lineHeight: 1.6 }}>
                🔔 {lbl.footerNote}
              </p>
              <div
                style={{
                  marginTop: '10px',
                  fontSize: '9px',
                  color: '#94a3b8',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                }}
              >
                Powered by HealthNexa AI Kiosk
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 p-4 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-100 cursor-pointer transition-colors"
          >
            {lbl.closeBtn}
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm shadow-md cursor-pointer transition-colors"
          >
            {lbl.printBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
