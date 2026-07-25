import type { Netlist } from '../netlist/build'
import type { Waveforms } from './spice/mapResult'
import type { Analysis } from './spice/serialize'

export type { Analysis }

/** シミュレーション結果。定量エンジンはノード電圧・素子電流・波形を載せる */
export interface SimulationResult {
  readonly status: 'ok' | 'not-implemented' | 'error'
  readonly summary: string
  /** nodeId → 電圧 [V] (動作点) */
  readonly nodeVoltages?: Readonly<Record<string, number>>
  /** blockId → 電流 [A] (符号つき, 動作点) */
  readonly elementCurrents?: Readonly<Record<string, number>>
  /** 過渡解析の時系列 (.tran のときのみ) */
  readonly waveforms?: Waveforms
}

/**
 * シミュレータ差し替え境界。バッチ(要求 → 応答)の定量エンジン (ngspice-wasm) 用。
 * 連続実行のライブ経路は別契約 (`streamPort.ts` の ScopeStream)。
 * 入力は Netlist 契約 + 解析種別 (.op / .tran)。
 */
export interface SimulationPort {
  simulate(netlist: Netlist, analysis?: Analysis): Promise<SimulationResult>
}

/** PoC 用スタブ。ネット数・素子数・基準ノード有無を数えて返すだけ */
export const stubSimulator: SimulationPort = {
  simulate: (netlist) =>
    Promise.resolve({
      status: 'not-implemented',
      summary: `ネット ${netlist.nets.length} / 素子 ${netlist.elements.length} / GND ${netlist.groundNode ? 'あり' : 'なし'} (シミュレーション未実装)`,
    }),
}
