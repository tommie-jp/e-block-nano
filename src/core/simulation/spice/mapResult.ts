import type { SpiceNetlist } from './serialize'

/** ngspice 結果のうち本コードが使う部分 (eecircuit-engine ResultType の部分集合) */
export interface SpiceRunResult {
  readonly data: readonly { readonly name: string; readonly values: readonly number[] }[]
}

export interface MappedResult {
  /** nodeId → 電圧 [V] */
  readonly nodeVoltages: Record<string, number>
  /** blockId → 電流 [A] (符号つき) */
  readonly elementCurrents: Record<string, number>
}

/** 過渡解析の時系列。time と、各 nodeId の電圧系列(＋任意で各 blockId の電流系列) */
export interface Waveforms {
  readonly time: number[]
  readonly nodeVoltages: Record<string, number[]>
  /** blockId → 電流系列[A]。ライブ(LiveScopePanel)でのみ付く。バッチ経路では省略 */
  readonly elementCurrents?: Record<string, number[]>
}

/**
 * ngspice の結果ベクトル (`v(n1)`, `i(vmd1)` …) を、うちの nodeId / blockId へ
 * 対応表 (SpiceNetlist) を使って戻す純関数。基準ノード '0' は 0V とする。
 */
export const mapSpiceResult = (
  result: SpiceRunResult,
  spice: SpiceNetlist,
): MappedResult => {
  const byName = new Map(result.data.map((d) => [d.name, d.values[0] ?? 0]))

  const nodeVoltages: Record<string, number> = {}
  for (const [nodeId, spiceName] of Object.entries(spice.nodeNames)) {
    nodeVoltages[nodeId] =
      spiceName === '0' ? 0 : (byName.get(`v(${spiceName})`) ?? 0)
  }

  const elementCurrents: Record<string, number> = {}
  for (const [blockId, probeVar] of Object.entries(spice.currentProbes)) {
    const value = byName.get(probeVar)
    if (value !== undefined) elementCurrents[blockId] = value
  }

  return { nodeVoltages, elementCurrents }
}

/**
 * 過渡解析(.tran)の結果を時系列へ戻す純関数。
 * time ベクトルと、各 nodeId の電圧系列を対応表で紐付ける。
 */
export const mapSpiceWaveforms = (
  result: SpiceRunResult,
  spice: SpiceNetlist,
): Waveforms => {
  const seriesByName = new Map(result.data.map((d) => [d.name, d.values]))
  const time = [...(seriesByName.get('time') ?? [])]

  const nodeVoltages: Record<string, number[]> = {}
  for (const [nodeId, spiceName] of Object.entries(spice.nodeNames)) {
    if (spiceName === '0') {
      nodeVoltages[nodeId] = time.map(() => 0)
      continue
    }
    const series = seriesByName.get(`v(${spiceName})`)
    if (series) nodeVoltages[nodeId] = [...series]
  }

  return { time, nodeVoltages }
}
