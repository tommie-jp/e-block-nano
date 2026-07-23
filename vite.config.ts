import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // WSL 外 (Windows ブラウザ等) からのアクセスを許可
  },
})
