import type { LiveSample } from '../streamPort'
import type { SpiceNetlist } from './serialize'

/**
 * libngspice の `SendData`(1 タイムポイントの全ベクトル)を、うちの nodeId 系の
 * {@link LiveSample} へ戻す純ロジック。`mapSpiceWaveforms`(バッチ)の 1 点版で、
 * ベクトル名の並びは実行中ずっと不変なので **対応表を 1 回だけ** 作って
 * (`buildStreamMap`)、各点は index 引きで軽く適用する(`toLiveSample`)。
 */

type Slot =
  | { readonly kind: 'time' }
  | { readonly kind: 'node'; readonly nodeId: string }
  | { readonly kind: 'ignore' }

/** ベクトル並び(vecNames)に対応するスロット表 + 常時 0V を注入する基準ノード群 */
export interface StreamMap {
  readonly slots: readonly Slot[]
  readonly groundNodes: readonly string[]
}

/** `v(<inner>)` 形式なら inner(小文字)を返す。電圧以外は null */
const voltageInner = (name: string): string | null => {
  const lower = name.toLowerCase()
  return lower.startsWith('v(') && lower.endsWith(')') ? lower.slice(2, -1) : null
}

/**
 * SPICE ベクトル名の並びから、各 index の役割(時間 / どの nodeId の電圧 / 無視)を
 * 解決する。基準ノード(SPICE 名 '0')は SendData に現れないので別枠で保持し、
 * {@link toLiveSample} で 0V を注入する。
 */
export const buildStreamMap = (
  spice: SpiceNetlist,
  vecNames: readonly string[],
): StreamMap => {
  const nodeBySpice = new Map<string, string>()
  const groundNodes: string[] = []
  for (const [nodeId, spiceName] of Object.entries(spice.nodeNames)) {
    if (spiceName === '0') groundNodes.push(nodeId)
    else nodeBySpice.set(spiceName.toLowerCase(), nodeId)
  }

  const slots: Slot[] = vecNames.map((name) => {
    const lower = name.toLowerCase()
    if (lower === 'time') return { kind: 'time' }
    // ngspice の shared API(SendData)はノード電圧を**裸のノード名**(例 'n1')で
    // 返す。print 表記の 'v(n1)' も一応許容。電流(例 'v1#branch')は対象外。
    const inner = voltageInner(lower)
    const nodeId = nodeBySpice.get(lower) ?? (inner ? nodeBySpice.get(inner) : undefined)
    if (nodeId !== undefined) return { kind: 'node', nodeId }
    return { kind: 'ignore' }
  })

  return { slots, groundNodes }
}

/** 1 点の値配列(vecNames と同順)を {@link LiveSample} へ。基準ノードは 0V で埋める */
export const toLiveSample = (
  map: StreamMap,
  values: readonly number[],
): LiveSample => {
  const out: Record<string, number> = {}
  for (const nodeId of map.groundNodes) out[nodeId] = 0

  let t = 0
  const n = Math.min(map.slots.length, values.length)
  for (let i = 0; i < n; i++) {
    const slot = map.slots[i]
    if (slot.kind === 'time') t = values[i]
    else if (slot.kind === 'node') out[slot.nodeId] = values[i]
  }
  return { t, values: out }
}
