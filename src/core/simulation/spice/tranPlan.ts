import type { Netlist } from '../../netlist/build'
import type { TranStartup } from './serialize'

/**
 * 過渡解析のパラメータ (時間窓と起動条件) を回路そのものから決める。
 *
 * 盤面は自由に編集できて「いまどのサンプルか」は残らない (カメラ認識の盤面にも
 * サンプル ID は無い) ので、解析条件はサンプル定義ではなく netlist から導く。
 * こうすると Lチカ〜マルチバイブレータ (信号源なし・秒オーダー) と 1石アンプ
 * (1kHz・ミリ秒オーダー) が同じ画面で自動的に正しい窓になる。
 */

/** 信号源が無い回路の窓 (点滅マルチバイブレータなど秒オーダーの回路向け) */
export const DEFAULT_TRAN = { step: 0.02, stop: 5 } as const

/** 正弦波源があるときに映す周期数 */
const CYCLES = 5
/** 1 周期あたりの点数 (刻みの決め方) */
const POINTS_PER_CYCLE = 200

export interface TranPlan {
  readonly step: number
  readonly stop: number
  readonly startup: TranStartup
}

/** パルス源はトリガ幅の何倍まで映すか (立ち上がり・保持・復帰が収まる長さ) */
const PULSE_TAIL = 1.5

/** パルス源の (遅延, 幅) 一覧 [s] */
const pulseSpans = (netlist: Netlist): { delay: number; width: number }[] =>
  netlist.elements.flatMap((e) =>
    e.device.kind === 'ac-source' && e.device.wave.kind === 'pulse'
      ? [{ delay: e.device.wave.delaySeconds, width: e.device.wave.widthSeconds }]
      : [],
  )

/** 正弦波源の周波数一覧 [Hz] */
const sineHertz = (netlist: Netlist): number[] =>
  netlist.elements.flatMap((e) =>
    e.device.kind === 'ac-source' && e.device.wave.kind === 'sin'
      ? [e.device.wave.hertz]
      : [],
  )

const hasSource = (netlist: Netlist): boolean =>
  netlist.elements.some((e) => e.device.kind === 'ac-source')

const hasNpn = (netlist: Netlist): boolean =>
  netlist.elements.some((e) => e.device.kind === 'transistor-npn')

/**
 * 起動条件の既定:
 * - 信号源がある = 外部から駆動される回路 → バイアス点 (`operating-point`) から。
 *   増幅器をキックすると整定が波形に混ざって利得が測れない
 * - 信号源が無くトランジスタがある = 自己発振・双安定 → `uic-kick`。
 *   対称なマルチバイブレータはメタ安定で起動しないため状態を決めてやる
 * - どちらでもない → `zero-state` (コンデンサを 0 から充電。RC 充放電の観測)
 */
export const startupFor = (netlist: Netlist): TranStartup => {
  if (hasSource(netlist)) return 'operating-point'
  return hasNpn(netlist) ? 'uic-kick' : 'zero-state'
}

/**
 * 時間窓:
 * - 正弦波源があれば「最低周波数の 5 周期」を映し、刻みは「最高周波数の 1 周期を
 *   200 点」で刻む
 * - パルス源なら「トリガ開始 → 幅の 1.5 倍後」まで映す (遅延点灯タイマーのように
 *   トリガが続いている間の挙動と、切れた後の復帰が入る長さ)。刻みは窓の 1/1000
 * - どちらも無ければ既定の窓
 */
export const tranPlanFor = (netlist: Netlist): TranPlan => {
  const startup = startupFor(netlist)
  const freqs = sineHertz(netlist)
  if (freqs.length > 0) {
    return {
      stop: CYCLES / Math.min(...freqs),
      step: 1 / (POINTS_PER_CYCLE * Math.max(...freqs)),
      startup,
    }
  }
  const pulses = pulseSpans(netlist)
  if (pulses.length > 0) {
    const stop = Math.max(...pulses.map((p) => p.delay + p.width * PULSE_TAIL))
    return { stop, step: stop / 1000, startup }
  }
  return { ...DEFAULT_TRAN, startup }
}
