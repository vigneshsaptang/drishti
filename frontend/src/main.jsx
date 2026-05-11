import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'

if (import.meta.env.PROD && window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject = function () {};
}

window.addEventListener('error', (event) => {
  try {
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'runtime',
        message: event.message || 'Unknown error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack || null,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => { /* fire-and-forget */ });
  } catch { /* fire-and-forget */ }
});

window.addEventListener('unhandledrejection', (event) => {
  try {
    const err = event.reason;
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'unhandled_rejection',
        message: err?.message || String(err),
        stack: err?.stack || null,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => { /* fire-and-forget */ });
  } catch { /* fire-and-forget */ }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
