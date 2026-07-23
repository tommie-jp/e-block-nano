import type { Netlist } from '../netlist/build'

/** シミュレーション結果。定量エンジンはノード電圧・素子電流を載せる */
export interface SimulationResult {
  readonly status: 'ok' | 'not-implemented' | 'error'
  readonly summary: string
  /** nodeId → 電圧 [V] */
  readonly nodeVoltages?: Readonly<Record<string, number>>
  /** blockId → 電流 [A] (符号つき) */
  readonly elementCurrents?: Readonly<Record<string, number>>
}

/**
 * シミュレータ差し替え境界。
 * 将来 CircuitJS1 (見える化) / ngspice-wasm (定量) をこの port の裏に挿す。
 * 入力は Netlist 契約 (ネット + 素子) に固定する。
 */
export interface SimulationPort {
  simulate(netlist: Netlist): Promise<SimulationResult>
}

/** PoC 用スタブ。ネット数・素子数・基準ノード有無を数えて返すだけ */
export const stubSimulator: SimulationPort = {
  simulate: (netlist) =>
    Promise.resolve({
      status: 'not-implemented',
      summary: `ネット ${netlist.nets.length} / 素子 ${netlist.elements.length} / GND ${netlist.groundNode ? 'あり' : 'なし'} (シミュレーション未実装)`,
    }),
}
