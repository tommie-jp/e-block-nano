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
})
