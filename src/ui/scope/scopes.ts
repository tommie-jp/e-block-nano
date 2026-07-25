import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { createLayout } from './panes'
import type { ScopeLayout } from './panes'

/**
 * 1 つのオシロ画面の状態。波形パネルは複数のスコープを縦に並べ、各スコープは
 * 表示内容 (トレースとペイン) と参照波形を独立に持つ。表示モード/振幅/トリガ等の
 * 一時 UI 状態は WaveformChart 内のローカル state。
 */
export interface Scope {
  readonly id: string
  /** 何をどのペインに映すか (スコープごとに独立) */
  readonly layout: ScopeLayout
  /** 重畳比較用に保存した波形 (このスコープ専用) */
  readonly reference: Waveforms | null
}

export const makeScope = (id: string): Scope => ({
  id,
  layout: createLayout(),
  reference: null,
})

/** レイアウトを差し替えた新しいスコープを返す (immutable) */
export const withLayout = (
  scope: Scope,
  update: (l: ScopeLayout) => ScopeLayout,
): Scope => ({ ...scope, layout: update(scope.layout) })

/** 末尾に新しいスコープを追加 (immutable) */
export const appendScope = (scopes: readonly Scope[], id: string): Scope[] => [
  ...scopes,
  makeScope(id),
]

/** 指定 ID のスコープを取り除く (immutable) */
export const removeScope = (scopes: readonly Scope[], id: string): Scope[] =>
  scopes.filter((s) => s.id !== id)

/** 参照波形を差し替えた新しいスコープを返す (immutable) */
export const withReference = (
  scope: Scope,
  reference: Waveforms | null,
): Scope => ({ ...scope, reference })

/**
 * いずれかのスコープで見えている (電圧トレースがあり visible な) ノード ID を
 * `allIds` の順序で返す。ボードにノード位置の●を重ねる用。
 */
export const unionVisibleIds = (
  scopes: readonly Scope[],
  allIds: readonly string[],
): string[] => {
  const shown = new Set<string>()
  for (const s of scopes)
    for (const t of s.layout.traces)
      if (t.expr.kind === 'v' && t.visible) shown.add(t.expr.node)
  return allIds.filter((id) => shown.has(id))
}
