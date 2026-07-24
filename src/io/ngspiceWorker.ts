/// <reference lib="webworker" />
import { Simulation } from 'eecircuit-engine'

/**
 * ngspice-wasm (eecircuit-engine) を Web Worker で動かすホスト。
 * エンジン (初回 40MB WASM) は worker 内で **一度だけ** start し、以後は再利用する。
 * メインスレッドから { id, text } を受け、SPICE を実行して生の結果 { id, raw } を返す。
 * setNetList→runSim は再入不可なので 1 件ずつ直列処理する。
 */

let enginePromise: Promise<Simulation> | null = null
const engine = (): Promise<Simulation> => {
  if (!enginePromise) {
    enginePromise = (async () => {
      const sim = new Simulation()
      await sim.start()
      return sim
    })()
  }
  return enginePromise
}

interface RunRequest {
  readonly id: number
  readonly text: string
}

// 直列化: 前の実行の完了を待ってから次を流す (runSim は再入不可)
let chain: Promise<unknown> = Promise.resolve()

self.onmessage = (e: MessageEvent<RunRequest>): void => {
  const { id, text } = e.data
  chain = chain.then(async () => {
    try {
      const sim = await engine()
      sim.setNetList(text)
      const raw = await sim.runSim()
      self.postMessage({ id, ok: true, raw })
    } catch (err) {
      self.postMessage({
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
