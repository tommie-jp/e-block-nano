import { describe, expect, test } from 'vitest'
import { mapSpiceResult } from './mapResult'
import type { SpiceNetlist } from './serialize'

const spice: SpiceNetlist = {
  text: '',
  nodeNames: { 'H:1,0': '0', 'H:0,0': 'n1', 'H:2,1': 'n2' },
  currentProbes: { 'blk-battery': 'i(v1)', 'blk-led': 'i(vmd1)' },
}

describe('mapSpiceResult', () => {
  test('maps node voltages back to nodeIds, ground = 0', () => {
    const result = {
      data: [
        { name: 'v(n1)', values: [3] },
        { name: 'v(n2)', values: [1.89] },
        { name: 'i(v1)', values: [-0.0011] },
        { name: 'i(vmd1)', values: [0.0011] },
      ],
    }

    const { nodeVoltages } = mapSpiceResult(result, spice)

    expect(nodeVoltages['H:1,0']).toBe(0) // 基準ノード
    expect(nodeVoltages['H:0,0']).toBe(3)
    expect(nodeVoltages['H:2,1']).toBeCloseTo(1.89)
  })

  test('maps current probes back to blockIds', () => {
    const result = {
      data: [
        { name: 'i(v1)', values: [-0.0011] },
        { name: 'i(vmd1)', values: [0.0011] },
      ],
    }

    const { elementCurrents } = mapSpiceResult(result, spice)

    expect(elementCurrents['blk-battery']).toBeCloseTo(-0.0011)
    expect(elementCurrents['blk-led']).toBeCloseTo(0.0011)
  })

  test('missing vectors default to 0V and omit currents', () => {
    const { nodeVoltages, elementCurrents } = mapSpiceResult({ data: [] }, spice)

    expect(nodeVoltages['H:0,0']).toBe(0)
    expect(elementCurrents['blk-led']).toBeUndefined()
  })
})
