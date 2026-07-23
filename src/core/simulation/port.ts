import type { Net } from '../netlist/build'

/** シミュレーション結果 (PoC ではサマリのみ)。将来は波形・ノード電圧が入る */
export interface SimulationResult {
  readonly status: 'ok' | 'not-implemented'
  readonly summary: string
}

/**
 * シミュレータ差し替え境界。
 * 将来 CircuitJS1 (見える化) / ngspice-wasm (定量) をこの port の裏に挿す。
 */
export interface SimulationPort {
  simulate(nets: readonly Net[]): Promise<SimulationResult>
}

/** PoC 用スタブ。ネット数を数えて返すだけ */
export const stubSimulator: SimulationPort = {
  simulate: (nets) =>
    Promise.resolve({
      status: 'not-implemented',
      summary: `ネット数: ${nets.length} (シミュレーションは未実装)`,
    }),
}
