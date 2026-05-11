import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initMainFirebase, testMainAnalyticsEvent } from '../../../shared/firebase/initMain'

initMainFirebase()
if (import.meta.env.DEV) {
  const key = 'orca_main_analytics_test_sent_v1'
  if (!localStorage.getItem(key)) {
    if (testMainAnalyticsEvent()) localStorage.setItem(key, '1')
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
