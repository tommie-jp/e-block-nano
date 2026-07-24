import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// package.json の version をビルド時に埋め込む (画面右上のバージョン表示に使う)。
// バージョンは ./doVersion.sh で上げる。
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true, // WSL 外 (Windows ブラウザ等) からのアクセスを許可
    // Tailscale MagicDNS (*.ts.net) からのアクセスを許可。
    // IP 直打ちは既定で通るが、MagicDNS 名や tailscale serve 経由 (Host ヘッダが
    // *.ts.net) は allowedHosts に無いと vite が 403 で弾く。
    allowedHosts: ['.ts.net'],
  },
})
