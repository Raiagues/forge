import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Apply the persisted theme before first paint so there's no flash of the
// wrong palette. The store reads the same key (forge.theme).
try {
  const t = localStorage.getItem('forge.theme')
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light'
} catch { document.documentElement.dataset.theme = 'light' }

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)
