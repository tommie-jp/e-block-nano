import { describe, expect, test } from 'vitest'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { NodeProbe } from '../waveProbes'
import {
  buildCurrentTraces,
  buildVoltageTraces,
  currentRange,
  dcOffsets,
  meanOf,
  rangeOf,
  voltageRange,
} from './traceSeries'

const probe = (nodeId: string, color = '#111', constant = false): NodeProbe => ({
  nodeId,
  color,
  label: nodeId.toUpperCase(),
  constant,
})

const waveforms: Waveforms = {
  time: [0, 1, 2],
  nodeVoltages: { n1: [1, 3, 1], n2: [0, 0, 0] },
}

describe('meanOf / rangeOf', () => {
  test('mean of an empty series is 0 (no NaN leaks into the chart)', () => {
    expect(meanOf([])).toBe(0)
    expect(meanOf([1, 2, 3])).toBe(2)
  })

  test('range of an empty series is 0..0', () => {
    expect(rangeOf([])).toEqual({ lo: 0, hi: 0 })
    expect(rangeOf([-1, 5, 2])).toEqual({ lo: -1, hi: 5 })
  })
})

describe('voltageRange', () => {
  const probes = [probe('n1'), probe('n2')]

  test('always includes 0 so the baseline is on screen', () => {
    const w: Waveforms = { time: [0, 1], nodeVoltages: { n1: [2, 3] } }

    expect(voltageRange(w, [probe('n1')], false, new Map())).toEqual({ min: 0, max: 3 })
  })

  test('spans every probe, not just the first', () => {
    const w: Waveforms = { time: [0], nodeVoltages: { n1: [1], n2: [-4] } }

    expect(voltageRange(w, probes, false, new Map())).toEqual({ min: -4, max: 1 })
  })

  test('AC coupling removes each series DC before ranging', () => {
    const dc = dcOffsets(waveforms, probes)

    // n1 = [1,3,1] − 平均(5/3) → 最大 +4/3、最小 −2/3
    const r = voltageRange(waveforms, probes, true, dc)

    expect(r.min).toBeCloseTo(-2 / 3)
    expect(r.max).toBeCloseTo(4 / 3)
  })

  test('a flat all-zero set falls back to ±1 instead of collapsing', () => {
    const w: Waveforms = { time: [0], nodeVoltages: { n2: [0] } }

    expect(voltageRange(w, [probe('n2')], false, new Map())).toEqual({ min: -1, max: 1 })
  })
})

describe('buildVoltageTraces', () => {
  test('one trace per visible probe, in probe order', () => {
    const traces = buildVoltageTraces({
      waveforms,
      visible: [probe('n1', '#abc')],
      ac: false,
      dc: new Map(),
    })

    expect(traces).toEqual([
      { key: 'n1', label: 'N1', color: '#abc', constant: false, values: [1, 3, 1] },
    ])
  })

  test('AC coupling subtracts the DC of that series', () => {
    const probes = [probe('n1')]
    const traces = buildVoltageTraces({
      waveforms,
      visible: probes,
      ac: true,
      dc: dcOffsets(waveforms, probes),
    })

    expect(traces[0].values[0]).toBeCloseTo(1 - 5 / 3)
  })

  test('appends the math trace last when a differential is set', () => {
    const traces = buildVoltageTraces({
      waveforms,
      visible: [probe('n1')],
      ac: false,
      dc: new Map(),
      mathNodes: { a: 'n1', b: 'n2', label: 'M: 両端電圧' },
      mathValues: [1, 3, 1],
    })

    expect(traces).toHaveLength(2)
    expect(traces[1].key).toBe('__math')
    expect(traces[1].label).toBe('M: 両端電圧')
  })

  test('no math trace without values (a node may have vanished)', () => {
    const traces = buildVoltageTraces({
      waveforms,
      visible: [probe('n1')],
      ac: false,
      dc: new Map(),
      mathNodes: { a: 'n1', b: 'gone', label: 'M' },
      mathValues: null,
    })

    expect(traces).toHaveLength(1)
  })
})

describe('buildCurrentTraces / currentRange', () => {
  const currents = { b1: [0.001, 0.002], b2: [-0.003, 0] }

  test('keys are prefixed so they cannot collide with node ids', () => {
    const traces = buildCurrentTraces(currents, { b1: 'LED' })

    expect(traces.map((t) => t.key)).toEqual(['i:b1', 'i:b2'])
    expect(traces[0].label).toBe('LED')
    expect(traces[1].label).toBe('b2') // ラベル未指定なら blockId
  })

  test('different elements get different colors', () => {
    const traces = buildCurrentTraces(currents, {})

    expect(traces[0].color).not.toBe(traces[1].color)
  })

  test('the current range always includes 0', () => {
    expect(currentRange(buildCurrentTraces({ b1: [0.001, 0.002] }, {}))).toEqual({
      min: 0,
      max: 0.002,
    })
  })

  test('a flat current does not collapse the axis', () => {
    const r = currentRange(buildCurrentTraces({ b1: [0, 0] }, {}))

    expect(r.max).toBeGreaterThan(r.min)
  })

  test('no traces means no range to draw', () => {
    expect(buildCurrentTraces({}, {})).toEqual([])
  })
})
