import type { PlotBox } from './geometry'

/** レーン間の余白率 (1=隙間なし)。0.9 で上下に少し空ける */
const LANE_FILL = 0.9

export interface Lane {
  /** レーン中心の y [px] (チャンネルの基準線) */
  readonly cy: number
  /** 中心から上下に使える半分高さ [px] */
  readonly half: number
}

/**
 * 段組み表示で i 番目 (全 n 個) のチャンネルが占めるレーンを返す。
 * プロット領域を n 等分し、各レーン中心を基準線にする。
 */
export const laneBand = (i: number, n: number, plot: PlotBox): Lane => {
  const h = plot.height / Math.max(1, n)
  const top = plot.top + i * h
  return { cy: top + h / 2, half: (h / 2) * LANE_FILL }
}
