import type { Waveforms } from '../simulation/spice/mapResult'

/**
 * オシロに出す 1 本の測定を表す式 (LTspice の trace 相当)。
 *
 * 電圧・電流・電力を「同列の式」に揃えることで、ペインへの配属も凡例も軸割当も
 * 種別ごとの特別扱いなしに書ける。L4 の式エディタ (`V(n1)*I(r1)` など) は
 * この union に Binary/Unary を足す形で乗る。
 *
 * 電力は評価時に netlist を要らなくするため、素子の両端ノードを式自身が持つ
 * (構築は `./elementNodes` の `powerExpr`)。
 */
export type TraceExpr =
  | { readonly kind: 'v'; readonly node: string }
  | { readonly kind: 'vdiff'; readonly a: string; readonly b: string }
  | { readonly kind: 'i'; readonly block: string }
  | {
      readonly kind: 'p'
      readonly block: string
      readonly a: string
      readonly b: string
    }

/** 表示単位。ペインの軸はこの単位ごとに分かれる */
export type Unit = 'V' | 'A' | 'W'

/** 表示名の対応表 (無ければ生の id を出す) */
export interface ExprNames {
  readonly nodes?: Readonly<Record<string, string>>
  readonly blocks?: Readonly<Record<string, string>>
}

export const unitOf = (e: TraceExpr): Unit => {
  switch (e.kind) {
    case 'v':
    case 'vdiff':
      return 'V'
    case 'i':
      return 'A'
    case 'p':
      return 'W'
  }
}

/** 同一トレース判定のキー。種別が違えば同じ id でも別物 */
export const exprKey = (e: TraceExpr): string => {
  switch (e.kind) {
    case 'v':
      return `v:${e.node}`
    case 'vdiff':
      return `d:${e.a}-${e.b}`
    case 'i':
      return `i:${e.block}`
    case 'p':
      return `p:${e.block}`
  }
}

export const exprLabel = (e: TraceExpr, names: ExprNames = {}): string => {
  const node = (id: string): string => names.nodes?.[id] ?? id
  const block = (id: string): string => names.blocks?.[id] ?? id
  switch (e.kind) {
    case 'v':
      return `V(${node(e.node)})`
    case 'vdiff':
      return `V(${node(e.a)},${node(e.b)})`
    case 'i':
      return `I(${block(e.block)})`
    case 'p':
      return `P(${block(e.block)})`
  }
}

const nodeSeries = (w: Waveforms, id: string): readonly number[] | null =>
  w.nodeVoltages[id] ?? null

const currentSeries = (w: Waveforms, id: string): readonly number[] | null =>
  w.elementCurrents?.[id] ?? null

/**
 * 式を波形データ上で評価する純関数。必要な系列が無ければ null
 * (バッチ結果に電流が無い / ノードが消えた、など) — 呼び出し側はそのトレースを飛ばす。
 */
export const evalExpr = (e: TraceExpr, w: Waveforms): number[] | null => {
  switch (e.kind) {
    case 'v': {
      const s = nodeSeries(w, e.node)
      return s ? [...s] : null
    }
    case 'vdiff': {
      const a = nodeSeries(w, e.a)
      const b = nodeSeries(w, e.b)
      return a && b ? a.map((x, i) => x - (b[i] ?? 0)) : null
    }
    case 'i': {
      const s = currentSeries(w, e.block)
      return s ? [...s] : null
    }
    case 'p': {
      const a = nodeSeries(w, e.a)
      const b = nodeSeries(w, e.b)
      const i = currentSeries(w, e.block)
      if (!a || !b || !i) return null
      return a.map((x, k) => (x - (b[k] ?? 0)) * (i[k] ?? 0))
    }
  }
}
