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
  | { readonly kind: 'const'; readonly value: number }
  | {
      readonly kind: 'bin'
      readonly op: '+' | '-' | '*' | '/'
      readonly left: TraceExpr
      readonly right: TraceExpr
    }
  | {
      readonly kind: 'fn'
      readonly fn: 'abs' | 'sqrt' | 'd'
      readonly arg: TraceExpr
    }

/**
 * 表示単位。ペインの軸はこの単位ごとに分かれる。
 * `x` は「単位が決まらない量」(比・微分・定数) で、専用の軸を持つ。
 */
export type Unit = 'V' | 'A' | 'W' | 'x'

/** 表示名の対応表 (無ければ生の id を出す) */
export interface ExprNames {
  readonly nodes?: Readonly<Record<string, string>>
  readonly blocks?: Readonly<Record<string, string>>
}

/**
 * 掛け算の単位。V×A = W が要点で、片方が無次元なら相手の単位になる。
 * それ以外 (V×V など) は素直に決まらないので `x` に落とす。
 */
const productUnit = (l: Unit, r: Unit): Unit => {
  if (l === 'x') return r
  if (r === 'x') return l
  if ((l === 'V' && r === 'A') || (l === 'A' && r === 'V')) return 'W'
  return 'x'
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
    case 'const':
      return 'x'
    case 'bin':
      switch (e.op) {
        case '+':
        case '-':
          // 足し引きは同じ単位同士が前提。無次元を足したら相手の単位を残す
          return unitOf(e.left) === 'x' ? unitOf(e.right) : unitOf(e.left)
        case '*':
          return productUnit(unitOf(e.left), unitOf(e.right))
        case '/':
          // 比は無次元。V/A (抵抗) なども専用の単位は持たない
          return 'x'
      }
      break
    case 'fn':
      // abs は単位そのまま。sqrt と d (時間微分) は単位が変わるので x
      return e.fn === 'abs' ? unitOf(e.arg) : 'x'
  }
  return 'x'
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
    case 'const':
      return `c:${e.value}`
    case 'bin':
      return `(${exprKey(e.left)}${e.op}${exprKey(e.right)})`
    case 'fn':
      return `${e.fn}(${exprKey(e.arg)})`
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
    case 'const':
      return `${e.value}`
    case 'bin':
      return `${exprLabel(e.left, names)}${e.op}${exprLabel(e.right, names)}`
    case 'fn':
      return `${e.fn}(${exprLabel(e.arg, names)})`
  }
}

/** 0 除算・非有限は 0 に潰す (グラフに NaN の穴を作らない) */
const finite = (v: number): number => (Number.isFinite(v) ? v : 0)

const apply = (op: '+' | '-' | '*' | '/', l: number, r: number): number => {
  switch (op) {
    case '+':
      return l + r
    case '-':
      return l - r
    case '*':
      return l * r
    case '/':
      return finite(l / r)
  }
}

/** 時間微分 dv/dt。非等間隔の `.tran` を前提に前後の差分で近似する */
const derivative = (time: readonly number[], values: readonly number[]): number[] =>
  values.map((_, i) => {
    const lo = i === 0 ? 0 : i - 1
    const hi = i === values.length - 1 ? values.length - 1 : i + 1
    const dt = time[hi] - time[lo]
    return dt > 0 ? finite((values[hi] - values[lo]) / dt) : 0
  })

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
    case 'const':
      return w.time.map(() => e.value)
    case 'bin': {
      const l = evalExpr(e.left, w)
      const r = evalExpr(e.right, w)
      if (!l || !r) return null
      return l.map((x, k) => apply(e.op, x, r[k] ?? 0))
    }
    case 'fn': {
      const arg = evalExpr(e.arg, w)
      if (!arg) return null
      if (e.fn === 'abs') return arg.map(Math.abs)
      if (e.fn === 'sqrt') return arg.map((v) => (v >= 0 ? Math.sqrt(v) : 0))
      return derivative(w.time, arg)
    }
  }
}
