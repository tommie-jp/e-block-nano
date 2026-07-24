import type { Waveforms } from '../../core/simulation/spice/mapResult'

/**
 * 1 つのオシロ画面の状態。波形パネルは複数のスコープを縦に並べ、各スコープは
 * チャンネル選択(凡例トグル)・参照波形を独立に持つ。表示モード/振幅/トリガ等の
 * 一時 UI 状態は WaveformChart 内のローカル state。ここは「どのノードを映すか」と
 * 「保存した参照波形」だけを親が保持する (ボードの●の集計に使うため)。
 */
export interface Scope {
  readonly id: string
  /** 凡例トグルで非表示にしたノード ID。スコープごとに独立 */
  readonly hidden: readonly string[]
  /** 重畳比較用に保存した波形 (このスコープ専用) */
  readonly reference: Waveforms | null
}

export const makeScope = (id: string): Scope => ({
  id,
  hidden: [],
  reference: null,
})

/** 末尾に新しいスコープを追加 (immutable) */
export const appendScope = (scopes: readonly Scope[], id: string): Scope[] => [
  ...scopes,
  makeScope(id),
]

/** 指定 ID のスコープを取り除く (immutable) */
export const removeScope = (scopes: readonly Scope[], id: string): Scope[] =>
  scopes.filter((s) => s.id !== id)

/** 1 ノードの表示/非表示を反転した新しいスコープを返す (immutable) */
export const withHiddenToggled = (scope: Scope, nodeId: string): Scope => {
  const hidden = scope.hidden.includes(nodeId)
    ? scope.hidden.filter((id) => id !== nodeId)
    : [...scope.hidden, nodeId]
  return { ...scope, hidden }
}

/** 参照波形を差し替えた新しいスコープを返す (immutable) */
export const withReference = (
  scope: Scope,
  reference: Waveforms | null,
): Scope => ({ ...scope, reference })

/**
 * いずれかのスコープで見えているノード ID を、`allIds` の順序で返す。
 * ボードにノード位置の●を重ねる用 (どこか 1 画面にでも映っていれば●を出す)。
 */
export const unionVisibleIds = (
  scopes: readonly Scope[],
  allIds: readonly string[],
): string[] => {
  const shown = new Set<string>()
  for (const s of scopes) {
    const hidden = new Set(s.hidden)
    for (const id of allIds) if (!hidden.has(id)) shown.add(id)
  }
  return allIds.filter((id) => shown.has(id))
}
