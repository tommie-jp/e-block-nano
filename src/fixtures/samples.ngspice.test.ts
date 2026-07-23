import { describe, expect, test } from 'vitest'
import { buildNetlist } from '../core/netlist/build'
import { deserializeBoard } from '../core/persistence/boardFile'
import { createNgspiceSimulator } from '../io/ngspiceSimulator'
import { getSample } from './circuits/samples'

/**
 * サンプル回路を実 ngspice-wasm で解いて解析解と突き合わせる統合テスト。
 * WASM を読むため遅い(数秒)ので、素振り用に分離。
 */
const simulate = (id: string) => {
  const sample = getSample(id)!
  const netlist = buildNetlist(deserializeBoard(JSON.stringify(sample.data)))
  return createNgspiceSimulator().simulate(netlist)
}

describe('sample circuits vs. analytic values (ngspice)', () => {
  test('01-分圧回路: midpoint ≈ 3V·10/11 = 2.73V', async () => {
    const result = await simulate('voltage-divider')
    const volts = Object.values(result.nodeVoltages ?? {})

    expect(Math.max(...volts)).toBeCloseTo(3, 2)
    expect(Math.min(...volts)).toBeCloseTo(0, 2)
    // 中点電圧が存在する
    expect(volts.some((v) => Math.abs(v - 2.727) < 0.01)).toBe(true)
  }, 60000)

  test('02-並列抵抗: source current ≈ 3.3mA', async () => {
    const result = await simulate('parallel-resistors')
    const maxCurrent = Math.max(
      ...Object.values(result.elementCurrents ?? {}).map(Math.abs),
    )
    expect(maxCurrent).toBeCloseTo(0.0033, 4)
  }, 60000)

  test('00-Lチカ: LED off (switch open by default)', async () => {
    const result = await simulate('led-blink')
    const maxCurrent = Math.max(
      ...Object.values(result.elementCurrents ?? {}).map(Math.abs),
    )
    expect(maxCurrent).toBeLessThan(1e-4) // 開スイッチ → ほぼ 0
  }, 60000)

  test('03-RC充放電: capacitor charges toward 3V, ~63% at τ=1s', async () => {
    const sample = getSample('rc-charge')!
    const netlist = buildNetlist(deserializeBoard(JSON.stringify(sample.data)))
    const result = await createNgspiceSimulator().simulate(netlist, {
      kind: 'tran',
      step: 0.02,
      stop: 5,
    })

    const wf = result.waveforms!
    expect(wf.time.length).toBeGreaterThan(10)
    // 充電するノード = 上昇幅 (終端 − 開始) が最大の系列 (定数の電源レールを避ける)
    const rise = (s: number[]): number => (s.at(-1) ?? 0) - (s[0] ?? 0)
    const series = Object.values(wf.nodeVoltages).reduce((a, b) =>
      rise(b) > rise(a) ? b : a,
    )
    // 開始 ≈ 0V、終端 ≈ 3V
    expect(series[0]).toBeLessThan(0.3)
    expect(series.at(-1)).toBeCloseTo(3, 1)
    // t≈1s(τ)で ≈63.2% = 1.9V 付近
    const iTau = wf.time.findIndex((t) => t >= 1.0)
    expect(series[iTau]).toBeGreaterThan(1.6)
    expect(series[iTau]).toBeLessThan(2.2)
  }, 60000)
})
