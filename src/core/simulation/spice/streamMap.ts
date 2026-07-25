import type { LiveSample } from '../streamPort'
import type { SpiceNetlist } from './serialize'

/**
 * libngspice の `SendData`(1 タイムポイントの全ベクトル)を、うちの nodeId / blockId 系の
 * {@link LiveSample} へ戻す純ロジック。ベクトル名の並びは実行中ずっと不変なので
 * **対応表を 1 回だけ** 作って(`buildStreamMap`)、各点は index 引きで軽く適用する。
 *
 * ノード電圧は裸のノード名(`n1`)で来る(print 表記の `v(n1)` も一応許容)。素子電流は
 * `<vsrc>#branch`(例 `v1#branch` / `vmd1#branch`)で来るので、`currentProbes`(blockId→
 * `i(v1)`)を逆引きして blockId 電流へ戻す。
 */

type Slot =
  | { readonly kind: 'time' }
  | { readonly kind: 'node'; readonly nodeId: string }
  | { readonly kind: 'current'; readonly blockId: string }
  | { readonly kind: 'ignore' }

/** ベクトル並び(vecNames)のスロット表 + 常時 0V を注入する基準ノード群 */
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
 * currentProbes の値を、SendData が返す電流ベクトル名(小文字)へ正規化する。
 * - `i(v1)`(電圧源/LED の print 表記) → `v1#branch`
 * - `@r1[i]`(素子内部電流、.save で出す) → `@r1[i]`(そのまま)
 */
const sendDataCurrentName = (probe: string): string => {
  const lower = probe.toLowerCase()
  if (lower.startsWith('i(') && lower.endsWith(')')) return `${lower.slice(2, -1)}#branch`
  return lower
}

/**
 * SPICE ベクトル名の並びから、各 index の役割(時間 / どの nodeId の電圧 / どの blockId の
 * 電流 / 無視)を解決する。基準ノード(SPICE 名 '0')は SendData に現れないので別枠で保持し、
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

  // SendData 電流名(例 'v1#branch' / '@r1[i]') → blockId
  const currentByVec = new Map<string, string>()
  for (const [blockId, probe] of Object.entries(spice.currentProbes)) {
    currentByVec.set(sendDataCurrentName(probe), blockId)
  }

  const slots: Slot[] = vecNames.map((name) => {
    const lower = name.toLowerCase()
    if (lower === 'time') return { kind: 'time' }
    // 電圧: 裸のノード名(n1) or print 表記 v(n1)
    const vInner = voltageInner(lower)
    const nodeId = nodeBySpice.get(lower) ?? (vInner ? nodeBySpice.get(vInner) : undefined)
    if (nodeId !== undefined) return { kind: 'node', nodeId }
    // 電流: SendData 名で直接引く
    const blockId = currentByVec.get(lower)
    if (blockId !== undefined) return { kind: 'current', blockId }
    return { kind: 'ignore' }
  })

  return { slots, groundNodes }
}

/** 1 点の値配列(vecNames と同順)を {@link LiveSample} へ。基準ノードは 0V で埋める */
export const toLiveSample = (
  map: StreamMap,
  values: readonly number[],
): LiveSample => {
  const nodeVoltages: Record<string, number> = {}
  for (const nodeId of map.groundNodes) nodeVoltages[nodeId] = 0
  const currents: Record<string, number> = {}

  let t = 0
  const n = Math.min(map.slots.length, values.length)
  for (let i = 0; i < n; i++) {
    const slot = map.slots[i]
    if (slot.kind === 'time') t = values[i]
    else if (slot.kind === 'node') nodeVoltages[slot.nodeId] = values[i]
    else if (slot.kind === 'current') currents[slot.blockId] = values[i]
  }
  return { t, values: nodeVoltages, currents }
}
