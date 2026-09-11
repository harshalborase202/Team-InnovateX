import React from 'react'
import ReactDOM from 'react-dom/client'
import { KioskProvider } from './context/KioskContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KioskProvider>
      <App />
    </KioskProvider>
  </React.StrictMode>
)
