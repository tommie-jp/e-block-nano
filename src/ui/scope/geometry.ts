/** チャート寸法 (SVG viewBox 座標)。目盛りラベル用にマージンを取る。
 *  right は電流(mA)の右軸ラベル、top/bottom は単位(V/s/mA)が目盛りと重ならない余白。 */
export const CHART = {
  W: 600,
  H: 240,
  M: { top: 16, right: 44, bottom: 30, left: 46 },
} as const

/** データが無い時に空オシロを描くための既定スケール (TRAN_STOP=5s / 0..3V 相当) */
export const DEFAULT_WINDOW = { start: 0, end: 5 } as const
export const DEFAULT_Y_RANGE = { min: 0, max: 3 } as const

export interface PlotBox {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

export interface Scales {
  /** 時間 [s] → x [px] */
  readonly x: (t: number) => number
  /** 電圧 [V] → y [px] */
  readonly y: (v: number) => number
  /** x [px] → 時間 [s] (カーソル用、窓内にクランプ) */
  readonly tFromX: (px: number) => number
  /** y [px] → 電圧 [V] (カーソル用、レンジ内にクランプ) */
  readonly vFromY: (py: number) => number
  readonly plot: PlotBox
  readonly win: { readonly start: number; readonly end: number }
  readonly yRange: { readonly min: number; readonly max: number }
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

/** グレーティクル用のプロット領域 (マージンを除いた内側) */
export const plotBox = (): PlotBox => {
  const { W, H, M } = CHART
  return {
    left: M.left,
    right: W - M.right,
    top: M.top,
    bottom: H - M.bottom,
    width: W - M.left - M.right,
    height: H - M.top - M.bottom,
  }
}

/** 窓 (時間) と電圧レンジからプロット領域のスケール変換を作る */
export const makeScales = (
  win: { start: number; end: number },
  yRange: { min: number; max: number },
): Scales => {
  const plot = plotBox()
  const tSpan = win.end - win.start || 1
  const vSpan = yRange.max - yRange.min || 1
  return {
    plot,
    win,
    yRange,
    x: (t) => plot.left + ((t - win.start) / tSpan) * plot.width,
    y: (v) => plot.top + (1 - (v - yRange.min) / vSpan) * plot.height,
    tFromX: (px) =>
      clamp(win.start + ((px - plot.left) / plot.width) * tSpan, win.start, win.end),
    vFromY: (py) =>
      clamp(
        yRange.min + (1 - (py - plot.top) / plot.height) * vSpan,
        yRange.min,
        yRange.max,
      ),
  }
}
