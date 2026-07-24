/**
 * ライブストリーム実行の制御ロジック(純関数群)。
 *
 * worker 本体(ブラウザ依存: Worker/WASM/postMessage)から判断部分だけを切り出し、
 * 単体テスト可能にしたもの。連続演算は「1 本の長い `.tran` を breakpoint で
 * 区切り、`resume` で継続」する方式(Phase 0 spike で実証)。
 */

/**
 * 現在到達したシム時刻から、次に張る breakpoint 時刻を返す。
 * interval 格子の「次の点」へ切り上げる(ちょうど格子上なら次の格子へ進めて、
 * 同じ点で止まり続けないようにする)。
 */
export const nextBreakpoint = (reachedTime: number, intervalSec: number): number => {
  if (intervalSec <= 0) return reachedTime
  const k = Math.floor(reachedTime / intervalSec + 1e-9)
  return (k + 1) * intervalSec
}

/**
 * 壁時計をシム時刻に追従させるための待ち時間 [ms]。
 * 目標壁時計 = simTime × timebase。まだ手前なら差分だけ待ち、既に遅れていれば 0。
 */
export const pacingDelayMs = (
  simTime: number,
  wallElapsedMs: number,
  timebase: number,
): number => Math.max(0, simTime * 1000 * timebase - wallElapsedMs)

/**
 * 実行中 alter のコマンド文字列。blockId→SPICE デバイス参照名(例 'r1')を
 * 対応表で引く。対応が無ければ null(無視)。
 */
export const alterCommand = (
  deviceRefs: Readonly<Record<string, string>>,
  blockId: string,
  value: number,
): string | null => {
  const ref = deviceRefs[blockId]
  return ref ? `alter ${ref} = ${value}` : null
}

/** 次の停止時刻が horizon 以上なら、`.tran` を張り直す(再アーム)必要がある */
export const needsRearm = (nextStop: number, horizon: number): boolean =>
  nextStop >= horizon
