import type { Unit } from '../../core/scope/traceExpr'
import { SERIES_COLORS } from '../waveProbes'

/** 電流トレースの色 (電圧の SERIES_COLORS と混同しないよう別セット) */
export const CURRENT_COLORS = ['#ffd54f', '#4dd0e1', '#f06292', '#aed581', '#ff8a65']
/** 電力トレースの色 (電圧・電流のどちらとも被らない寒色寄り) */
export const POWER_COLORS = ['#b39ddb', '#80cbc4', '#ffab91', '#c5e1a5', '#90caf9']
/** 単位の決まらない量 (比・微分・定数) の色 */
export const OTHER_COLORS = ['#cfd8dc', '#a5d6a7', '#ce93d8', '#ffcc80', '#9fa8da']

/** 単位ごとの色パレット。同じ単位のトレースは順に別の色を取る */
export const PALETTE: Record<Unit, readonly string[]> = {
  V: SERIES_COLORS,
  A: CURRENT_COLORS,
  W: POWER_COLORS,
  x: OTHER_COLORS,
}
