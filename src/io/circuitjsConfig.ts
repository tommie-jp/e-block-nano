/**
 * CircuitJS1 埋め込みのベース URL。
 * 既定は自前ホスト (`public/circuitjs/` に `npm run fetch:circuitjs` で配置)。
 * `VITE_CIRCUITJS_BASE` で差し替え可 (デモ時は falstad.com を指せる)。
 * `?cct=` 方式なのでクロスオリジンでも動く。
 */
export const CIRCUITJS_BASE: string =
  import.meta.env.VITE_CIRCUITJS_BASE ||
  `${import.meta.env.BASE_URL}circuitjs/circuitjs.html`
