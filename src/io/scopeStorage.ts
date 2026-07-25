import type { ScopeLayout } from '../ui/scope/panes'

/**
 * オシロの表示設定 (トレースとペイン) をブラウザに残す。LTspice の `.plt` 相当。
 *
 * 保存するのは「何をどのペインに映すか」だけ。波形データや一時的なつまみ
 * (掃引・トリガ・ズーム) は含めない — 回路を開き直したときに、前回の測定の
 * 続きから見られるようにするのが目的。
 */

const KEY = 'e-block-nano.scope-layout.v1'

/** 復元した値が今のレイアウト型として使えるかを最低限確かめる */
const looksLikeLayout = (value: unknown): value is ScopeLayout => {
  if (typeof value !== 'object' || value === null) return false
  const l = value as Partial<ScopeLayout>
  return (
    Array.isArray(l.panes) &&
    Array.isArray(l.traces) &&
    typeof l.seq === 'number' &&
    Array.isArray(l.knownNodes) &&
    l.panes.every((p) => typeof p?.id === 'string') &&
    l.traces.every(
      (t) => typeof t?.id === 'string' && typeof t?.paneId === 'string' && !!t?.expr,
    )
  )
}

export const saveScopeLayout = (layout: ScopeLayout): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // 容量オーバーやプライベートモード。表示設定なので黙って諦めてよい
  }
}

/** 保存済みのレイアウト。無い/壊れている場合は null */
export const loadScopeLayout = (): ScopeLayout | null => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return looksLikeLayout(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const clearScopeLayout = (): void => {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 消せなくても実害は無い
  }
}
