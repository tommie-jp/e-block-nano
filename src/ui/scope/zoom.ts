import type { Scales } from './geometry'

/**
 * 矩形ドラッグズームと Zoom Back (LTspice の波形ビューア相当) の純ロジック。
 *
 * ズームは「時間窓 (X, 全ペイン共通) ＋ そのペインの Y レンジ」の組で表す。
 * 戻れるようにスタックへ積み、Zoom Back で 1 段ずつ戻す。
 */

export interface Window {
  readonly start: number
  readonly end: number
}

export interface ZoomView {
  readonly win: Window
  readonly yRange: { readonly min: number; readonly max: number }
}

export interface Point {
  readonly x: number
  readonly y: number
}

/** これ未満の矩形は「クリック」とみなしてズームしない [px] */
const MIN_DRAG_PX = 6

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

/**
 * ドラッグの 2 点 → その矩形が覆う時間窓と Y レンジ。
 * 上下・左右どちら向きのドラッグでも同じ結果。小さすぎる矩形は null。
 */
export const rectToView = (
  from: Point,
  to: Point,
  scales: Scales,
): ZoomView | null => {
  const { plot } = scales
  const x1 = clamp(Math.min(from.x, to.x), plot.left, plot.right)
  const x2 = clamp(Math.max(from.x, to.x), plot.left, plot.right)
  const y1 = clamp(Math.min(from.y, to.y), plot.top, plot.bottom)
  const y2 = clamp(Math.max(from.y, to.y), plot.top, plot.bottom)
  if (x2 - x1 < MIN_DRAG_PX || y2 - y1 < MIN_DRAG_PX) return null

  return {
    win: { start: scales.tFromX(x1), end: scales.tFromX(x2) },
    // SVG は上が小さい y なので、上端が最大値になる
    yRange: { min: scales.vFromY(y2), max: scales.vFromY(y1) },
  }
}

/** ズーム履歴に 1 段積む (immutable) */
export const pushZoom = (
  stack: readonly ZoomView[],
  view: ZoomView,
): ZoomView[] => [...stack, view]

/**
 * 1 段戻る。戻り先が無ければ `view: null` (= 自動レンジへ戻す) を返す。
 */
export const popZoom = (
  stack: readonly ZoomView[],
): { view: ZoomView | null; stack: ZoomView[] } => {
  const shorter = stack.slice(0, -1)
  return { view: shorter.at(-1) ?? null, stack: shorter }
}

/**
 * ズーム窓がまだデータの範囲と重なっているか。回路を変えて時間軸が動いたら
 * 空っぽの窓を見続けることになるので、呼び出し側はこれで自動へ戻す。
 */
export const fitsWindow = (win: Window, data: Window): boolean =>
  win.start < data.end && win.end > data.start
