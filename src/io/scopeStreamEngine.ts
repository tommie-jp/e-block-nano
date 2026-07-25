import { toSpice } from '../core/simulation/spice/serialize'
import { alterCommand } from '../core/simulation/streamControl'
import type { Netlist } from '../core/netlist/build'
import type {
  LiveSample,
  ScopeStream,
  StreamConfig,
  Unsubscribe,
} from '../core/simulation/streamPort'
import type { MainToWorker, WorkerToMain } from './streamMessages'

/**
 * ライブストリーム(連続オシロ)エンジンのメインスレッド側ホスト。
 * 実体は Web Worker(`scopeStreamWorker.ts`)で、libngspice(shared mode, ASYNCIFY
 * なし)の連続 `.tran` を breakpoint+resume で回し、`SendData` の各点を流し込む。
 *
 * 既存の {@link ngspiceWorker} と同じ手書き postMessage パターン(Comlink なし)。
 * こちらは 1 回きりの応答ではなく **連続ストリーム**＋制御チャネル(alter/stop)。
 */
export const createScopeStream = (): ScopeStream => {
  const worker = new Worker(new URL('./scopeStreamWorker.ts', import.meta.url), {
    type: 'module',
  })
  const subs = new Set<(sample: LiveSample) => void>()
  // alter の宛先(blockId → SPICE デバイス名)。start のたび更新
  let deviceRefs: Readonly<Record<string, string>> = {}

  worker.onmessage = (e: MessageEvent<WorkerToMain>): void => {
    const msg = e.data
    if (msg.type === 'samples') {
      for (const s of msg.samples) for (const cb of subs) cb(s)
    }
  }

  const send = (m: MainToWorker): void => worker.postMessage(m)

  return {
    start(netlist: Netlist, cfg: StreamConfig): void {
      // 連続ストリーム用に stop=horizon の 1 本の .tran を作る(worker が区切る)
      const spice = toSpice(netlist, {
        kind: 'tran',
        step: cfg.step,
        stop: cfg.horizon,
      })
      deviceRefs = spice.deviceRefs
      send({
        type: 'start',
        text: spice.text,
        nodeNames: spice.nodeNames,
        currentProbes: spice.currentProbes,
        cfg,
      })
    },
    onSample(cb: (sample: LiveSample) => void): Unsubscribe {
      subs.add(cb)
      return () => {
        subs.delete(cb)
      }
    },
    alter(blockId: string, value: number): void {
      const cmd = alterCommand(deviceRefs, blockId, value)
      if (cmd) send({ type: 'alter', cmd })
    },
    setTimebase(secPerDiv: number): void {
      send({ type: 'timebase', value: secPerDiv })
    },
    stop(): void {
      send({ type: 'stop' })
    },
  }
}
