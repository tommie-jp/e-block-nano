import { exprKey, unitOf } from '../../core/scope/traceExpr'
import type { TraceExpr, Unit } from '../../core/scope/traceExpr'
import { PALETTE } from './palette'

/**
 * オシロの表示レイアウト (LTspice のプロットペイン相当)。
 *
 * X 軸 (時間窓・トリガ・掃引) は全ペイン共有、Y 軸はペインごと。1 つのペインは
 * **単位を 2 つまで**しか持てない (左軸 = 最初の単位、右軸 = 2 つ目)。3 つ目の
 * 単位を同じ枠に混ぜると軸ラベルが嘘になるので、新しいペインへ落とす。
 */

/** ペイン 1 枚。Y レンジは自動 (全トレースに合わせる) か手動 */
export interface Pane {
  readonly id: string
  readonly yMode: 'auto' | 'manual'
  readonly yRange?: { readonly min: number; readonly max: number }
}

/** 表示中のトレース 1 本。どのペインに属し、何色で描くか */
export interface Trace {
  readonly id: string
  readonly expr: TraceExpr
  readonly paneId: string
  readonly color: string
  readonly visible: boolean
}

export interface ScopeLayout {
  readonly panes: readonly Pane[]
  readonly traces: readonly Trace[]
  /** id 採番用の連番 (Date/Math.random を使わず決定的にするため) */
  readonly seq: number
}

/** 1 ペインが持てる単位の上限 (左軸・右軸) */
const MAX_UNITS_PER_PANE = 2

export const createLayout = (): ScopeLayout => ({
  panes: [{ id: 'pane-1', yMode: 'auto' }],
  traces: [],
  seq: 1,
})

/** そのペインに属するトレース (追加順) */
export const paneTraces = (l: ScopeLayout, paneId: string): Trace[] =>
  l.traces.filter((t) => t.paneId === paneId)

/** そのペインが使っている単位 (最大 2 つ。先頭が左軸、2 つ目が右軸) */
export const paneUnits = (l: ScopeLayout, paneId: string): Unit[] => {
  const units: Unit[] = []
  for (const t of paneTraces(l, paneId)) {
    const u = unitOf(t.expr)
    if (!units.includes(u)) units.push(u)
  }
  return units
}

/** そのトレースが左右どちらの軸で描かれるか。トレースが無ければ null */
export const axisOf = (l: ScopeLayout, traceId: string): 'left' | 'right' | null => {
  const trace = l.traces.find((t) => t.id === traceId)
  if (!trace) return null
  const units = paneUnits(l, trace.paneId)
  return units.indexOf(unitOf(trace.expr)) === 0 ? 'left' : 'right'
}

/** そのペインがこの単位を受け入れられるか (既に使っている単位か、空きがあるか) */
const accepts = (l: ScopeLayout, paneId: string, unit: Unit): boolean => {
  const units = paneUnits(l, paneId)
  return units.includes(unit) || units.length < MAX_UNITS_PER_PANE
}

/** 同じ単位で未使用の色を選ぶ (使い切ったら先頭から回す) */
const pickColor = (l: ScopeLayout, unit: Unit): string => {
  const palette = PALETTE[unit]
  const used = new Set(
    l.traces.filter((t) => unitOf(t.expr) === unit).map((t) => t.color),
  )
  return palette.find((c) => !used.has(c)) ?? palette[used.size % palette.length]
}

/**
 * トレースを追加する (immutable)。同じ式が既にあれば何もしない。
 * 行き先は `paneId` 指定 → 受け入れ可能な既存ペイン → 新規ペイン の順。
 */
export const addTrace = (
  l: ScopeLayout,
  expr: TraceExpr,
  paneId?: string,
): ScopeLayout => {
  const key = exprKey(expr)
  if (l.traces.some((t) => exprKey(t.expr) === key)) return l

  const unit = unitOf(expr)
  const target =
    (paneId && accepts(l, paneId, unit) ? paneId : undefined) ??
    l.panes.find((p) => accepts(l, p.id, unit))?.id

  const seq = l.seq + 1
  const base = target
    ? { panes: l.panes, paneId: target, seq }
    : {
        panes: [...l.panes, { id: `pane-${seq}`, yMode: 'auto' as const }],
        paneId: `pane-${seq}`,
        seq,
      }

  return {
    panes: base.panes,
    seq: base.seq,
    traces: [
      ...l.traces,
      {
        id: `trace-${base.seq}`,
        expr,
        paneId: base.paneId,
        color: pickColor(l, unit),
        visible: true,
      },
    ],
  }
}

export const removeTrace = (l: ScopeLayout, traceId: string): ScopeLayout => ({
  ...l,
  traces: l.traces.filter((t) => t.id !== traceId),
})

/** プローブ操作用: 同じ式があれば外し、無ければ足す */
export const toggleTraceExpr = (l: ScopeLayout, expr: TraceExpr): ScopeLayout => {
  const key = exprKey(expr)
  const found = l.traces.find((t) => exprKey(t.expr) === key)
  return found ? removeTrace(l, found.id) : addTrace(l, expr)
}

/** 凡例トグル: 消しても行 (色・所属) は残す */
export const toggleVisible = (l: ScopeLayout, traceId: string): ScopeLayout => ({
  ...l,
  traces: l.traces.map((t) =>
    t.id === traceId ? { ...t, visible: !t.visible } : t,
  ),
})

export const addPane = (l: ScopeLayout): ScopeLayout => {
  const seq = l.seq + 1
  return { ...l, seq, panes: [...l.panes, { id: `pane-${seq}`, yMode: 'auto' }] }
}

/** ペインを閉じる。中のトレースも一緒に消える。最後の 1 枚は閉じられない */
export const removePane = (l: ScopeLayout, paneId: string): ScopeLayout => {
  if (l.panes.length <= 1 || !l.panes.some((p) => p.id === paneId)) return l
  return {
    ...l,
    panes: l.panes.filter((p) => p.id !== paneId),
    traces: l.traces.filter((t) => t.paneId !== paneId),
  }
}

/** トレースを別ペインへ移す。単位が入らないペインへは移さない (元のまま返す) */
export const moveTrace = (
  l: ScopeLayout,
  traceId: string,
  paneId: string,
): ScopeLayout => {
  const trace = l.traces.find((t) => t.id === traceId)
  if (!trace || !l.panes.some((p) => p.id === paneId)) return l
  // 移動先の単位数は「自分を抜いた状態」で数える (同ペインへの移動は無害)
  const without: ScopeLayout = { ...l, traces: l.traces.filter((t) => t.id !== traceId) }
  if (!accepts(without, paneId, unitOf(trace.expr))) return l
  return {
    ...l,
    traces: l.traces.map((t) => (t.id === traceId ? { ...t, paneId } : t)),
  }
}

/** ペインの Y レンジ設定 (auto ↔ manual) */
export const setPaneYRange = (
  l: ScopeLayout,
  paneId: string,
  yRange: { min: number; max: number } | null,
): ScopeLayout => ({
  ...l,
  panes: l.panes.map((p) =>
    p.id === paneId
      ? yRange
        ? { ...p, yMode: 'manual', yRange }
        : { id: p.id, yMode: 'auto' }
      : p,
  ),
})
