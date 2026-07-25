import type { Netlist } from '../netlist/build'
import { devicePins } from '../parts/types'
import type { TraceExpr } from './traceExpr'

/**
 * 素子の両端ノード。2 端子素子だけが持つ (トランジスタのような 3 端子は
 * 「両端」が一意に決まらないので null)。
 *
 * 順序はデバイス定義のピン順 = 抵抗/コンデンサ/SW は a→b、LED/ダイオードは
 * anode→cathode、電池は plus→minus。電流の向きと揃うので、この順で
 * V(a)−V(b) を取ると電力の符号が「消費が正」になる。
 */
export const terminalNodes = (
  netlist: Netlist,
  blockId: string,
): { readonly a: string; readonly b: string } | null => {
  const el = netlist.elements.find((e) => e.blockId === blockId)
  if (!el) return null
  const roles = devicePins(el.device).map(([role]) => role)
  if (roles.length !== 2) return null
  const a = el.pinNodes[roles[0]]
  const b = el.pinNodes[roles[1]]
  return a && b && a !== b ? { a, b } : null
}

/** 素子電流の式。両端ノードは要らない */
export const currentExpr = (blockId: string): TraceExpr => ({
  kind: 'i',
  block: blockId,
})

/** 瞬時電力の式 P=(V(a)−V(b))·I。2 端子素子でなければ null */
export const powerExpr = (netlist: Netlist, blockId: string): TraceExpr | null => {
  const nodes = terminalNodes(netlist, blockId)
  return nodes ? { kind: 'p', block: blockId, a: nodes.a, b: nodes.b } : null
}
