import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { IdentifyFlow } from './features/identify/IdentifyFlow'
import { ScreenConverse } from './features/converse/ScreenConverse'
import { ScreenScan } from './features/scan/ScreenScan'
import { ScreenSummary } from './features/summary/ScreenSummary'
import { ScreenClinician } from './features/clinician/ScreenClinician'
import { ScreenPatientDashboard } from './features/patient/ScreenPatientDashboard'
import { PersistentAccessibilityControls } from './components/PersistentAccessibilityControls'

export default function App() {
  return (
    <BrowserRouter>
      {/* Persistent accessibility settings, repeat audio, and call-for-help */}
      <PersistentAccessibilityControls />

      <Routes>
        {/* Patient journey */}
        <Route path="/" element={<IdentifyFlow />} />
        <Route path="/converse" element={<ScreenConverse />} />
        <Route path="/scan" element={<ScreenScan />} />
        <Route path="/summary" element={<ScreenSummary />} />
        <Route path="/summarize" element={<ScreenSummary />} />

        {/* Patient Dashboard / Personal Health Account */}
        <Route path="/patient" element={<ScreenPatientDashboard />} />
        <Route path="/patient/dashboard" element={<ScreenPatientDashboard />} />

        {/* Physician view */}
        <Route path="/clinician" element={<ScreenClinician />} />
        <Route path="/consult" element={<ScreenClinician />} />
        <Route path="/consult/:sessionId" element={<ScreenClinician />} />
      </Routes>
    </BrowserRouter>
  )
}
