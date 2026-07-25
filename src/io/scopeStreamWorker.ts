/// <reference lib="webworker" />
import createNgspiceModule, { type NgspiceModule } from './ngspice/libngspice'
import wasmUrl from './ngspice/libngspice.wasm?url'
import {
  buildStreamMap,
  toLiveSample,
  type StreamMap,
} from '../core/simulation/spice/streamMap'
import {
  needsRearm,
  nextBreakpoint,
  pacingDelayMs,
} from '../core/simulation/streamControl'
import type { LiveSample, StreamConfig } from '../core/simulation/streamPort'
import type { MainToWorker, WorkerToMain } from './streamMessages'

/**
 * libngspice(shared mode)を Web Worker で駆動し、連続 `.tran` を breakpoint+resume で
 * 回して `SendData` の各点をメインへ流すホスト。ブロッキングな run/resume は worker
 * スレッドで回るので UI は固まらない。ASYNCIFY は使わない(Phase 0 spike の結論)。
 */

// vecvaluesall / vecvalues の構造体オフセット(wasm32, double 8B 整列。spike で実証)
const VVA_COUNT = 0
const VVA_VECSA = 8
const VV_NAME = 0
const VV_CREAL = 8

let mod: NgspiceModule | null = null
let map: StreamMap | null = null
let nodeNames: Readonly<Record<string, string>> = {}
let currentProbes: Readonly<Record<string, string>> = {}
let pending: LiveSample[] = []
let lastSimT = 0
let sampleCount = 0
let stopReq = false
let running = false
let timebase = 1
const alterQueue: string[] = []

const post = (m: WorkerToMain): void => self.postMessage(m)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const cmd = (s: string): void => {
  mod?.ccall('ngSpice_Command', 'number', ['string'], [s])
}
const flush = (): void => {
  if (pending.length > 0) {
    post({ type: 'samples', samples: pending })
    pending = []
  }
}

/** SendData: 1 タイムポイントの全ベクトルを LiveSample にして貯める */
function onSendData(vecvaluesall: number): number {
  const m = mod
  if (!m) return 0
  const count = m.getValue(vecvaluesall + VVA_COUNT, 'i32')
  const vecsa = m.getValue(vecvaluesall + VVA_VECSA, 'i32')
  const values = new Array<number>(count)

  if (!map) {
    // 初回のみベクトル名を読み、対応表を 1 度だけ作る(名前は実行中不変)
    const names = new Array<string>(count)
    for (let i = 0; i < count; i++) {
      const pvv = m.getValue(vecsa + i * 4, 'i32')
      names[i] = m.UTF8ToString(m.getValue(pvv + VV_NAME, 'i32'))
      values[i] = m.getValue(pvv + VV_CREAL, 'double')
    }
    map = buildStreamMap({ text: '', nodeNames, currentProbes, deviceRefs: {} }, names)
  } else {
    for (let i = 0; i < count; i++) {
      const pvv = m.getValue(vecsa + i * 4, 'i32')
      values[i] = m.getValue(pvv + VV_CREAL, 'double')
    }
  }

  const s = toLiveSample(map, values)
  lastSimT = s.t
  sampleCount++
  pending.push(s)
  return 0
}

async function init(): Promise<void> {
  mod = await createNgspiceModule({
    locateFile: (p) => (p.endsWith('.wasm') ? wasmUrl : p),
  })
  const noop = (): number => 0
  const fpChar = mod.addFunction(noop, 'iiii')
  const fpStat = mod.addFunction(noop, 'iiii')
  const fpExit = mod.addFunction(noop, 'iiiiii')
  const fpData = mod.addFunction(onSendData, 'iiiii')
  const fpInit = mod.addFunction(noop, 'iiii')
  const fpBG = mod.addFunction(noop, 'iiii')
  mod.ccall(
    'ngSpice_Init',
    'number',
    ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
    [fpChar, fpStat, fpExit, fpData, fpInit, fpBG, 0],
  )
}

/**
 * 連続実行ループ。1 本の `.tran`(stop=horizon)を interval ごとの breakpoint で
 * 止め、resume で継続。停止の合間に alter を適用し、壁時計へ pacing する。
 */
async function runLoop(text: string, cfg: StreamConfig): Promise<void> {
  map = null
  pending = []
  lastSimT = 0
  sampleCount = 0
  stopReq = false
  running = true

  // /proc/meminfo が無いブラウザでは ngspice が「メモリ不足」を誤検出し、毎ステップ
  // 重い文字列生成＋警告を吐く(連続 .tran では致命的に遅い)。丸ごと無効化する。
  cmd('set no_mem_check')

  for (const line of text.split('\n')) {
    if (line.trim()) cmd(`circbyline ${line}`)
  }

  // 素子内部電流(@ref[i])を SendData に出すため保存対象に追加する。
  // 'save all' で標準セット(ノード電圧＋ソース電流)、それに @形式のプローブを足す。
  const extraSaves = Object.values(currentProbes).filter((p) => p.startsWith('@'))
  cmd(extraSaves.length > 0 ? `save all ${extraSaves.join(' ')}` : 'save all')

  let bp = nextBreakpoint(0, cfg.intervalSec)
  cmd(`stop when time > ${bp}`)
  const wall0 = performance.now()
  cmd('run')
  flush()

  while (!stopReq) {
    while (alterQueue.length > 0) {
      const c = alterQueue.shift()
      if (c) cmd(c)
    }

    const delay = pacingDelayMs(lastSimT, performance.now() - wall0, timebase)
    if (delay > 0) await sleep(delay)

    bp = nextBreakpoint(lastSimT, cfg.intervalSec)
    if (needsRearm(bp, cfg.horizon)) break // horizon 到達(再アームは将来対応)

    cmd('delete')
    cmd(`stop when time > ${bp}`)
    const before = sampleCount
    cmd('resume')
    flush()
    post({ type: 'status', simTime: lastSimT, running: true })

    if (sampleCount === before) break // 進まなくなったら終了
    await sleep(0) // イベントループを 1 周回して alter/stop を受ける
  }

  running = false
  flush()
  post({ type: 'status', simTime: lastSimT, running: false })
}

self.onmessage = async (e: MessageEvent<MainToWorker>): Promise<void> => {
  const msg = e.data
  switch (msg.type) {
    case 'start':
      if (running) {
        stopReq = true
        // 前ループがイベントループを解放するまで待ってから張り直す
        await sleep(0)
      }
      nodeNames = msg.nodeNames
      currentProbes = msg.currentProbes
      if (!mod) await init()
      void runLoop(msg.text, msg.cfg) // 継続実行(await しない)
      break
    case 'alter':
      alterQueue.push(msg.cmd)
      break
    case 'timebase':
      timebase = msg.value
      break
    case 'stop':
      stopReq = true
      break
  }
}
