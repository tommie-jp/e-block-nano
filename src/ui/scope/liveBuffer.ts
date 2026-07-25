import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { LiveSample } from '../../core/simulation/streamPort'

/**
 * ライブストリーム用の固定容量リングバッファ(純ロジック)。
 *
 * `SendData`(worker)から流れてくる {@link LiveSample}(電圧＋電流)を貯め、表示側は
 * {@link LiveBuffer.toWindow} で既存の {@link Waveforms} 形(`time[]` + `nodeVoltages`
 * ＋任意で `elementCurrents`)を得る。これで `measureSeries` / `triggerTime` /
 * `revealedSamples` / `selectProbes` など既存の純ロジックがそのまま食える。
 *
 * 容量固定＝表示メモリは有界。回路は実行中不変なので nodeId/blockId 集合は最初の
 * push で確定する。内部は可変(性能のため)だが `toWindow` は毎回新しい配列を返す。
 */
export interface LiveBuffer {
  push(sample: LiveSample): void
  clear(): void
  size(): number
  latestTime(): number | null
  toWindow(spanSec?: number): Waveforms
}

export const createLiveBuffer = (capacity: number): LiveBuffer => {
  const cap = Math.max(1, Math.floor(capacity))
  let nodeIds: string[] = []
  let blockIds: string[] = []
  let time = new Float64Array(0)
  let cols: Float64Array[] = [] // 電圧(nodeIds 順)
  let currentCols: Float64Array[] = [] // 電流(blockIds 順)
  let head = 0
  let count = 0

  const ensureInit = (sample: LiveSample): void => {
    if (nodeIds.length > 0) return // 電圧ノードは必ず 1 つ以上あるので初期化判定に使える
    nodeIds = Object.keys(sample.values).sort()
    blockIds = Object.keys(sample.currents).sort()
    time = new Float64Array(cap)
    cols = nodeIds.map(() => new Float64Array(cap))
    currentCols = blockIds.map(() => new Float64Array(cap))
  }

  const physical = (logical: number): number => (head - count + logical + cap) % cap

  const push = (sample: LiveSample): void => {
    ensureInit(sample)
    time[head] = sample.t
    for (let c = 0; c < nodeIds.length; c++) {
      cols[c][head] = sample.values[nodeIds[c]] ?? 0
    }
    for (let c = 0; c < blockIds.length; c++) {
      currentCols[c][head] = sample.currents[blockIds[c]] ?? 0
    }
    head = (head + 1) % cap
    count = Math.min(count + 1, cap)
  }

  const latestTime = (): number | null =>
    count === 0 ? null : time[physical(count - 1)]

  const toWindow = (spanSec?: number): Waveforms => {
    if (count === 0) return { time: [], nodeVoltages: {}, elementCurrents: {} }
    const latest = time[physical(count - 1)]
    const cutoff = spanSec === undefined ? -Infinity : latest - spanSec

    let startLogical = 0
    while (startLogical < count && time[physical(startLogical)] < cutoff) startLogical++

    const outLen = count - startLogical
    const outTime = new Array<number>(outLen)
    const nodeVoltages: Record<string, number[]> = {}
    const elementCurrents: Record<string, number[]> = {}
    for (const id of nodeIds) nodeVoltages[id] = new Array<number>(outLen)
    for (const id of blockIds) elementCurrents[id] = new Array<number>(outLen)

    for (let i = 0; i < outLen; i++) {
      const p = physical(startLogical + i)
      outTime[i] = time[p]
      for (let c = 0; c < nodeIds.length; c++) nodeVoltages[nodeIds[c]][i] = cols[c][p]
      for (let c = 0; c < blockIds.length; c++) {
        elementCurrents[blockIds[c]][i] = currentCols[c][p]
      }
    }
    return { time: outTime, nodeVoltages, elementCurrents }
  }

  const clear = (): void => {
    head = 0
    count = 0
  }

  return { push, clear, size: () => count, latestTime, toWindow }
}
