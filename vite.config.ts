import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative asset paths so the build works from any folder (e.g. GitHub Pages /trading-journal/).
export default defineConfig({ base: './', plugins: [react()], server: { port: 5173 }, preview: { port: 5173 } })
