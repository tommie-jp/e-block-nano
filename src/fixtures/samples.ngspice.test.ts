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

  // 04-マルチバイブレータの「発振」は vite-node では確実に再現するが
  // (`tools/` の検証や scratch で 11 crossings/3s を確認)、vitest 環境では
  // eecircuit-engine の過渡が起動しないことがある (対称マルチの既知メタ安定 +
  // 環境依存)。ここでは「エラーなく過渡波形を生成する」ことだけを堅牢に確認し、
  // 発振トポロジ(クロス結合)は samples.test.ts の決定論的な構造テストで守る。
  test('04-点滅マルチバイブレータ: runs a transient without error', async () => {
    const sample = getSample('astable-multivibrator')!
    const netlist = buildNetlist(deserializeBoard(JSON.stringify(sample.data)))
    const result = await createNgspiceSimulator().simulate(netlist, {
      kind: 'tran',
      step: 0.005,
      stop: 3,
    })

    expect(result.status).toBe('ok')
    expect(result.waveforms?.time.length ?? 0).toBeGreaterThan(100)
  }, 60000)
})
