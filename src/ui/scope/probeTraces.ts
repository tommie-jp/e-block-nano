import type { MathNodes } from './mathTrace'

/**
 * オシロに足す測定の一覧 (LTspice のトレース一覧相当)。ボードのプローブ操作
 * ({@link ./probePick}) と凡例トグルの両方がここを更新する。
 *
 * ノード電圧は数が少なく既定で全部出ているので、ここではなく `hidden`
 * ({@link toggleHidden}) で「消したもの」を持つ。電流は素子ごとに線が増えて
 * 煩雑なので LTspice 同様プローブで選ぶ (既定 0 本) — こちらがこの一覧。
 */
export type ProbeTrace =
  | { readonly kind: 'current'; readonly blockId: string }
  | { readonly kind: 'power'; readonly blockId: string }
  | { readonly kind: 'diff'; readonly a: string; readonly b: string }

/** 同一トレース判定に使うキー。種別が違えば同じ id でも別物 */
export const traceKey = (t: ProbeTrace): string => {
  switch (t.kind) {
    case 'current':
      return `i:${t.blockId}`
    case 'power':
      return `p:${t.blockId}`
    case 'diff':
      return `d:${t.a}-${t.b}`
  }
}

/** 電力プローブのある素子 (blockId) */
export const probedPowers = (list: readonly ProbeTrace[]): string[] =>
  list.filter((t) => t.kind === 'power').map((t) => t.blockId)

/**
 * トレースの追加/削除 (immutable)。同じキーが既にあれば外す。
 * 差動は WaveformChart の Math トレースが 1 本しか無いので、
 * 新しい差動は既存の差動を置き換える (複数同時は L2 のトレースモデルで)。
 */
export const toggleTrace = (
  list: readonly ProbeTrace[],
  t: ProbeTrace,
): ProbeTrace[] => {
  const key = traceKey(t)
  if (list.some((x) => traceKey(x) === key)) {
    return list.filter((x) => traceKey(x) !== key)
  }
  const kept = t.kind === 'diff' ? list.filter((x) => x.kind !== 'diff') : list
  return [...kept, t]
}

/**
 * 電圧トレースの表示/非表示を反転した新しい集合 (immutable)。
 * 既定は全ノード表示なので、持つのは「消したノード」だけ。ボードを編集しても
 * ノード ID は辺キーで安定しているため、この集合はそのまま使い続けられる。
 */
export const toggleHidden = (
  hidden: ReadonlySet<string>,
  nodeId: string,
): Set<string> => {
  const next = new Set(hidden)
  if (!next.delete(nodeId)) next.add(nodeId)
  return next
}

/** 電流プローブのある素子だけを残した blockId → 電流系列 */
export const probedCurrents = (
  list: readonly ProbeTrace[],
  currents: Readonly<Record<string, readonly number[]>>,
): Record<string, readonly number[]> => {
  const picked: Record<string, readonly number[]> = {}
  for (const t of list) {
    if (t.kind === 'current' && currents[t.blockId]) {
      picked[t.blockId] = currents[t.blockId]
    }
  }
  return picked
}

/** 差動トレース (あれば) を Math トレースの入力に変換する */
export const diffNodes = (list: readonly ProbeTrace[]): MathNodes | null => {
  const d = list.find((t) => t.kind === 'diff')
  return d ? { a: d.a, b: d.b, label: `M: ${d.a}−${d.b}` } : null
}
