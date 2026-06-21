import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// base:'./' so built assets load from file:// inside the packaged desktop app.
export default defineConfig({ base: './', plugins: [react()], server: { host: true } })
