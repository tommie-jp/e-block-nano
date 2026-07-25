import { describe, expect, test } from 'vitest'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import type { NodeProbe } from '../waveProbes'
import {
  buildCurrentTraces,
  buildVoltageTraces,
  dcOffsets,
  meanOf,
  rangeOf,
  traceRange,
  tracesOfUnit,
} from './traceSeries'
import type { DrawTrace } from './traceSeries'

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

/** レンジ確認用のダミー電圧トレース */
const voltageTraces = (series: number[][]): DrawTrace[] =>
  series.map((values, i) => ({
    expr: { kind: 'v', node: `n${i}` },
    key: `v:n${i}`,
    label: `N${i}`,
    color: '#111',
    constant: false,
    values,
  }))

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

describe('traceRange', () => {
  test('always includes 0 so the baseline is on screen', () => {
    expect(traceRange(voltageTraces([[2, 3]]), 1)).toEqual({ min: 0, max: 3 })
  })

  test('spans every trace, not just the first', () => {
    expect(traceRange(voltageTraces([[1], [-4]]), 1)).toEqual({ min: -4, max: 1 })
  })

  test('a flat set opens up by the pad instead of collapsing', () => {
    expect(traceRange(voltageTraces([[0, 0]]), 1)).toEqual({ min: -1, max: 1 })
  })

  test('no traces is still a drawable range', () => {
    const r = traceRange([], 1e-9)

    expect(r.max).toBeGreaterThan(r.min)
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
      {
        expr: { kind: 'v', node: 'n1' },
        key: 'v:n1',
        label: 'N1',
        color: '#abc',
        constant: false,
        values: [1, 3, 1],
      },
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

  test('appends the math trace last as a differential expression', () => {
    const traces = buildVoltageTraces({
      waveforms,
      visible: [probe('n1')],
      ac: false,
      dc: new Map(),
      mathNodes: { a: 'n1', b: 'n2', label: 'M: 両端電圧' },
      mathValues: [1, 3, 1],
    })

    expect(traces).toHaveLength(2)
    expect(traces[1].expr).toEqual({ kind: 'vdiff', a: 'n1', b: 'n2' })
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

describe('buildCurrentTraces', () => {
  const currents = { b1: [0.001, 0.002], b2: [-0.003, 0] }

  test('carries the current expression and a key that cannot collide with nodes', () => {
    const traces = buildCurrentTraces(currents, { b1: 'LED' })

    expect(traces.map((t) => t.key)).toEqual(['i:b1', 'i:b2'])
    expect(traces[0].expr).toEqual({ kind: 'i', block: 'b1' })
    expect(traces[0].label).toBe('LED')
    expect(traces[1].label).toBe('b2') // ラベル未指定なら blockId
  })

  test('different elements get different colors', () => {
    const traces = buildCurrentTraces(currents, {})

    expect(traces[0].color).not.toBe(traces[1].color)
  })

  test('nothing probed means nothing to draw', () => {
    expect(buildCurrentTraces({}, {})).toEqual([])
  })
})

describe('tracesOfUnit', () => {
  test('splits a pane into its left-axis and right-axis series', () => {
    const mixed = [...voltageTraces([[1]]), ...buildCurrentTraces({ b1: [0.001] }, {})]

    expect(tracesOfUnit(mixed, 'V').map((t) => t.key)).toEqual(['v:n0'])
    expect(tracesOfUnit(mixed, 'A').map((t) => t.key)).toEqual(['i:b1'])
    expect(tracesOfUnit(mixed, 'W')).toEqual([])
  })
})
