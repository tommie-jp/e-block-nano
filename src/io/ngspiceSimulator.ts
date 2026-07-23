import type { Simulation } from 'eecircuit-engine'
import type { Netlist } from '../core/netlist/build'
import type {
  Analysis,
  SimulationPort,
  SimulationResult,
} from '../core/simulation/port'
import { describeResult } from '../core/simulation/spice/interpret'
import {
  mapSpiceResult,
  mapSpiceWaveforms,
} from '../core/simulation/spice/mapResult'
import { toSpice } from '../core/simulation/spice/serialize'

/**
 * ngspice-wasm (eecircuit-engine) を裏に持つ定量シミュレータ。
 * `SimulationPort` の初の実装 (スタブの置換)。純粋な serializer / mapper は
 * core にあり、ここはエンジンの遅延ロードと実行 (I/O) だけを持つ。
 *
 * ※ 現状はメインスレッドで遅延ロード (初回 40MB WASM を読むので一瞬止まる)。
 *   将来 Web Worker に載せてブロックを避ける (contract は不変で差し替え可)。
 */
export const createNgspiceSimulator = (): SimulationPort => {
  let enginePromise: Promise<Simulation> | null = null

  const engine = (): Promise<Simulation> => {
    if (!enginePromise) {
      enginePromise = (async () => {
        const { Simulation } = await import('eecircuit-engine')
        const sim = new Simulation()
        await sim.start()
        return sim
      })()
    }
    return enginePromise
  }

  return {
    async simulate(
      netlist: Netlist,
      analysis: Analysis = { kind: 'op' },
    ): Promise<SimulationResult> {
      let spice
      try {
        spice = toSpice(netlist, analysis)
      } catch (e) {
        return {
          status: 'error',
          summary: e instanceof Error ? e.message : String(e),
        }
      }
      try {
        const sim = await engine()
        sim.setNetList(spice.text)
        const raw = await sim.runSim()
        if (raw.dataType !== 'real') {
          return {
            status: 'error',
            summary: 'ngspice が複素結果を返しました',
          }
        }
        if (analysis.kind === 'tran') {
          const waveforms = mapSpiceWaveforms(raw, spice)
          return {
            status: 'ok',
            summary: `過渡解析: ${waveforms.time.length} 点`,
            waveforms,
          }
        }
        const { nodeVoltages, elementCurrents } = mapSpiceResult(raw, spice)
        return {
          status: 'ok',
          summary: describeResult(netlist, elementCurrents, nodeVoltages),
          nodeVoltages,
          elementCurrents,
        }
      } catch (e) {
        return {
          status: 'error',
          summary: `ngspice 実行失敗: ${e instanceof Error ? e.message : String(e)}`,
        }
      }
    },
  }
}
