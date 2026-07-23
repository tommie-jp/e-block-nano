import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // WSL 外 (Windows ブラウザ等) からのアクセスを許可
    // Tailscale MagicDNS (*.ts.net) からのアクセスを許可。
    // IP 直打ちは既定で通るが、MagicDNS 名や tailscale serve 経由 (Host ヘッダが
    // *.ts.net) は allowedHosts に無いと vite が 403 で弾く。
    allowedHosts: ['.ts.net'],
  },
})
