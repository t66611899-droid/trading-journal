import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initStore } from './lib/store'
import { initCloud } from './lib/cloud'
import './styles.css'

initStore().then(() => {
  createRoot(document.getElementById('root')!).render(<App />)
  initCloud()
})
