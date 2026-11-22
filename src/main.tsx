import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initStore } from './lib/store'
import { initCloud } from './lib/cloud'
import './styles.css'

// The live Tradovate login was removed: forget the username and device id it remembered.
try { localStorage.removeItem('tj-tv-login'); localStorage.removeItem('tj-tv-device') } catch {}

initStore().then(() => {
  createRoot(document.getElementById('root')!).render(<App />)
  initCloud()
})
