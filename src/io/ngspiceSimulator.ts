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
import type { SpiceRunResult } from '../core/simulation/spice/mapResult'
import { toSpice } from '../core/simulation/spice/serialize'

type RawResult = SpiceRunResult & { readonly dataType?: string }
/** SPICE テキストを実行して生の結果ベクトルを返す関数 (Worker / 直接 の 2 実装) */
type RawRunner = (text: string) => Promise<RawResult>

interface WorkerReply {
  readonly id: number
  readonly ok: boolean
  readonly raw?: RawResult
  readonly error?: string
}

/**
 * Web Worker でエンジンを動かすランナー。初回 40MB WASM のロードと重い .tran が
 * メインスレッドを止めないようにする。エンジンは worker 内で一度だけ start され、
 * 以後のサンプル切替では再ロードしない。
 */
const createWorkerRunner = (): RawRunner => {
  let worker: Worker | null = null
  let seq = 0
  const pending = new Map<
    number,
    { resolve: (r: RawResult) => void; reject: (e: Error) => void }
  >()

  const getWorker = (): Worker => {
    if (!worker) {
      worker = new Worker(new URL('./ngspiceWorker.ts', import.meta.url), {
        type: 'module',
      })
      worker.onmessage = (e: MessageEvent<WorkerReply>): void => {
        const { id, ok, raw, error } = e.data
        const p = pending.get(id)
        if (!p) return
        pending.delete(id)
        if (ok && raw) p.resolve(raw)
        else p.reject(new Error(error ?? 'ngspice worker error'))
      }
      worker.onerror = (e: ErrorEvent): void => {
        for (const [, p] of pending) p.reject(new Error(e.message || 'ngspice worker crashed'))
        pending.clear()
      }
    }
    return worker
  }

  return (text) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      getWorker().postMessage({ id, text })
    })
}

/**
 * メインスレッドでエンジンを動かすランナー (Worker 非対応環境 = Node/テスト用)。
 * エンジンは一度だけ start し、setNetList→runSim は再入不可なので直列化する。
 */
const createDirectRunner = (): RawRunner => {
  let enginePromise: Promise<import('eecircuit-engine').Simulation> | null = null
  const engine = () => {
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
  let chain: Promise<unknown> = Promise.resolve()
  return (text) => {
    const run = chain.then(async () => {
      const sim = await engine()
      sim.setNetList(text)
      return (await sim.runSim()) as RawResult
    })
    chain = run.catch(() => {})
    return run
  }
}

/**
 * ngspice-wasm (eecircuit-engine) を裏に持つ定量シミュレータ。`SimulationPort` の実装。
 * ブラウザでは Web Worker、Worker 非対応環境 (Node/テスト) ではメインスレッドで実行。
 * SPICE 変換 (toSpice) と結果マッピング (mapSpice*) は純粋なのでここ (メイン) で行い、
 * ランナーへは SPICE テキスト、ランナーからは生の結果ベクトルだけをやり取りする。
 */
export const createNgspiceSimulator = (): SimulationPort => {
  let runner: RawRunner | null = null
  const runRaw = (text: string): Promise<RawResult> => {
    if (!runner) {
      // Node/テスト (Worker 非対応) のみ直接実行。この分岐は本番ビルドでは
      // 静的に false になり、direct 側の eecircuit-engine 取り込みごと落ちる
      // (ブラウザは worker チャンクだけを読む)。
      runner =
        import.meta.env.MODE === 'test' ? createDirectRunner() : createWorkerRunner()
    }
    return runner(text)
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
        return { status: 'error', summary: e instanceof Error ? e.message : String(e) }
      }
      try {
        const raw = await runRaw(spice.text)
        if (raw.dataType !== 'real') {
          return { status: 'error', summary: 'ngspice が複素結果を返しました' }
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
