import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AnalyticsConsent from './components/AnalyticsConsent.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import { initAnalytics } from './services/analytics.js'

// Starts PostHog Session Replay only if the visitor has already opted in.
initAnalytics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
      <AnalyticsConsent />
    </AuthProvider>
  </StrictMode>,
)
