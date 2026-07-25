import { exprKey, unitOf } from '../../core/scope/traceExpr'
import type { Unit } from '../../core/scope/traceExpr'
import { CHART, makeScales } from './geometry'
import type { Scales } from './geometry'
import type { Pane, ScopeLayout } from './panes'
import { traceRange, UNIT_DISPLAY } from './traceSeries'
import type { DrawTrace } from './traceSeries'

/**
 * レイアウト (どのトレースがどのペインか) と実データ (描画系列) を突き合わせて、
 * ペインごとの描画パラメータ (軸の単位・レンジ・スケール) を作る純ロジック。
 */

/** フラットな系列でも軸が潰れないよう開く幅。電圧は 1V、電流/電力は 1n */
const FLAT_PAD: Record<Unit, number> = { V: 1, A: 1e-9, W: 1e-9 }

/** ペイン 1 枚の SVG 高さ。増えるほど 1 枚を低くして全体が伸びすぎないように */
export const paneHeight = (count: number): number =>
  count <= 1 ? CHART.H : count === 2 ? 170 : 140

/** 窓・レンジ・高さからスケールを作る (ペイン共通の入口) */
export const paneScales = (
  win: { start: number; end: number },
  yRange: { min: number; max: number },
  height: number,
): Scales => makeScales(win, yRange, height)

/**
 * 自動レンジに縦ズーム (振幅つまみ) を掛ける。0 を動かさずに上下を詰めるので、
 * 基準線の位置が変わらないまま波形が大きくなる。
 */
export const zoomRange = (
  range: { min: number; max: number },
  gain: number,
): { min: number; max: number } =>
  gain === 1 ? range : { min: range.min / gain, max: range.max / gain }

/** 1 ペインの描画パラメータ */
export interface PaneRender {
  readonly pane: Pane
  readonly traces: DrawTrace[]
  readonly leftUnit: Unit
  readonly rightUnit: Unit | null
  readonly scales: Scales
  /** 右軸のレンジ (表示単位) と単位記号。右軸が無ければ undefined */
  readonly rightAxis?: { min: number; max: number; unit: string }
  /** 右軸トレースの値を表示単位へ換算する倍率 */
  readonly rightScale: number
}

/**
 * 各ペインの描画パラメータを作る。ペイン内の単位は最大 2 つ (左軸・右軸) で、
 * 順序はそのペインにトレースが入った順に従う。
 */
export const panesForRender = (
  layout: ScopeLayout,
  drawTraces: readonly DrawTrace[],
  win: { start: number; end: number },
  height: number,
  gain: number,
  emptyRange: { min: number; max: number },
): PaneRender[] => {
  const byKey = new Map(drawTraces.map((t) => [t.key, t]))

  return layout.panes.map((pane) => {
    const traces = layout.traces
      .filter((t) => t.paneId === pane.id && t.visible)
      .map((t) => byKey.get(exprKey(t.expr)))
      .filter((t): t is DrawTrace => t !== undefined)

    const units: Unit[] = []
    for (const t of traces) {
      const u = unitOf(t.expr)
      if (!units.includes(u)) units.push(u)
    }
    const leftUnit = units[0] ?? 'V'
    const rightUnit = units[1] ?? null

    const leftTraces = traces.filter((t) => unitOf(t.expr) === leftUnit)
    const autoLeft = leftTraces.length
      ? zoomRange(traceRange(leftTraces, FLAT_PAD[leftUnit]), gain)
      : emptyRange
    const yRange = pane.yMode === 'manual' && pane.yRange ? pane.yRange : autoLeft

    const rightScale = rightUnit ? UNIT_DISPLAY[rightUnit].scale : 1
    const rightAxis = rightUnit
      ? (() => {
          const raw = traceRange(
            traces.filter((t) => unitOf(t.expr) === rightUnit),
            FLAT_PAD[rightUnit],
          )
          return {
            min: raw.min * rightScale,
            max: raw.max * rightScale,
            unit: UNIT_DISPLAY[rightUnit].label,
          }
        })()
      : undefined

    return {
      pane,
      traces,
      leftUnit,
      rightUnit,
      scales: paneScales(win, yRange, height),
      rightAxis,
      rightScale,
    }
  })
}
