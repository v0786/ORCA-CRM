import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initKdsFirebase, testKdsAnalyticsEvent } from '../../../shared/firebase/initKds'

initKdsFirebase()
if (import.meta.env.DEV) {
  const key = 'orca_kds_analytics_test_sent_v1'
  if (!localStorage.getItem(key)) {
    if (testKdsAnalyticsEvent()) localStorage.setItem(key, '1')
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
