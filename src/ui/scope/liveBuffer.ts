import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { LiveSample } from '../../core/simulation/streamPort'

/**
 * ライブストリーム用の固定容量リングバッファ(純ロジック)。
 *
 * `SendData`(Phase 2 の worker)から流れてくる {@link LiveSample} を貯め、
 * 表示側は {@link LiveBuffer.toWindow} で **既存の {@link Waveforms} 形**
 * (`time[]` + `nodeVoltages`)を得る。これで `measureSeries` / `triggerTime` /
 * `revealedSamples` など既存の純ロジックがそのまま食える。
 *
 * 容量固定＝**表示メモリは有界**(古いサンプルから捨てる)。回路は実行中不変な
 * ので nodeId 集合は最初の push で確定する。内部は可変(性能のため)だが、
 * `toWindow` は毎回新しい配列を返す純出力。
 */
export interface LiveBuffer {
  push(sample: LiveSample): void
  clear(): void
  /** 現在の保持サンプル数 */
  size(): number
  /** 最新サンプルの時刻[s]。空なら null */
  latestTime(): number | null
  /** 直近 `spanSec` 秒(省略時は全保持分)を time 昇順の {@link Waveforms} で返す */
  toWindow(spanSec?: number): Waveforms
}

export const createLiveBuffer = (capacity: number): LiveBuffer => {
  const cap = Math.max(1, Math.floor(capacity))
  let nodeIds: string[] = []
  let time = new Float64Array(0)
  let cols: Float64Array[] = []
  let head = 0 // 次に書き込む物理位置
  let count = 0

  const ensureInit = (sample: LiveSample): void => {
    if (nodeIds.length > 0) return
    nodeIds = Object.keys(sample.values).sort()
    time = new Float64Array(cap)
    cols = nodeIds.map(() => new Float64Array(cap))
  }

  /** 論理 index(0=最古)→物理 index */
  const physical = (logical: number): number => (head - count + logical + cap) % cap

  const push = (sample: LiveSample): void => {
    ensureInit(sample)
    time[head] = sample.t
    for (let c = 0; c < nodeIds.length; c++) {
      cols[c][head] = sample.values[nodeIds[c]] ?? 0
    }
    head = (head + 1) % cap
    count = Math.min(count + 1, cap)
  }

  const latestTime = (): number | null =>
    count === 0 ? null : time[physical(count - 1)]

  const toWindow = (spanSec?: number): Waveforms => {
    if (count === 0) return { time: [], nodeVoltages: {} }
    const latest = time[physical(count - 1)]
    const cutoff = spanSec === undefined ? -Infinity : latest - spanSec

    // 論理順は時刻昇順。cutoff 以上になる最初の論理 index を線形に探す
    let startLogical = 0
    while (startLogical < count && time[physical(startLogical)] < cutoff) startLogical++

    const outLen = count - startLogical
    const outTime = new Array<number>(outLen)
    const nodeVoltages: Record<string, number[]> = {}
    for (const id of nodeIds) nodeVoltages[id] = new Array<number>(outLen)

    for (let i = 0; i < outLen; i++) {
      const p = physical(startLogical + i)
      outTime[i] = time[p]
      for (let c = 0; c < nodeIds.length; c++) {
        nodeVoltages[nodeIds[c]][i] = cols[c][p]
      }
    }
    return { time: outTime, nodeVoltages }
  }

  const clear = (): void => {
    head = 0
    count = 0
  }

  return { push, clear, size: () => count, latestTime, toWindow }
}
