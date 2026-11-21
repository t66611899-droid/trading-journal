import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In local development Tradovate's API is reached through this proxy; the deployed site calls it directly.
const proxy = {
  '/tv-live': { target: 'https://live.tradovateapi.com', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/tv-live/, '/v1') },
  '/tv-demo': { target: 'https://demo.tradovateapi.com', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/tv-demo/, '/v1') },
}
// Relative asset paths so the build works from any folder (e.g. GitHub Pages /trading-journal/).
export default defineConfig({ base: './', plugins: [react()], server: { port: 5173, proxy }, preview: { port: 5173, proxy } })
