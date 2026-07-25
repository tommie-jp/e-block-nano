import { describe, expect, test } from 'vitest'
import type { NodeProbe } from '../waveProbes'
import {
  buildDrawTrace,
  buildDrawTraces,
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

const input = (over: Partial<Parameters<typeof buildDrawTrace>[1]> = {}) => ({
  waveforms: {
    time: [0, 1, 2],
    nodeVoltages: { n1: [1, 3, 1], n2: [0, 0, 0] },
    elementCurrents: { b1: [0.001, 0.002, 0.003] },
  },
  probes: [probe('n1', '#abc')],
  deviceLabels: { b1: 'LED' },
  ac: false,
  dc: new Map<string, number>(),
  ...over,
})

describe('buildDrawTrace', () => {
  test('a node voltage takes its color and label from the board probe', () => {
    const t = buildDrawTrace({ expr: { kind: 'v', node: 'n1' }, color: '#zzz' }, input())

    expect(t).toEqual({
      expr: { kind: 'v', node: 'n1' },
      key: 'v:n1',
      label: 'N1',
      color: '#abc',
      constant: false,
      values: [1, 3, 1],
    })
  })

  test('AC coupling subtracts the DC of that series', () => {
    const probes = [probe('n1')]
    const t = buildDrawTrace(
      { expr: { kind: 'v', node: 'n1' }, color: '#111' },
      input({ ac: true, dc: dcOffsets(input().waveforms, probes), probes }),
    )

    expect(t?.values[0]).toBeCloseTo(1 - 5 / 3)
  })

  test('a current takes its color from the layout and its name from the device', () => {
    const t = buildDrawTrace({ expr: { kind: 'i', block: 'b1' }, color: '#ffd54f' }, input())

    expect(t).toMatchObject({ key: 'i:b1', label: 'LED', color: '#ffd54f' })
  })

  test('power is evaluated from the terminal voltages and the current', () => {
    const t = buildDrawTrace(
      { expr: { kind: 'p', block: 'b1', a: 'n1', b: 'n2' }, color: '#b39ddb' },
      input(),
    )

    expect(t?.label).toBe('LED 電力')
    expect(t?.values).toEqual([0.001, 0.006, 0.003])
  })

  test('a differential is drawn as the white math trace', () => {
    const t = buildDrawTrace(
      { expr: { kind: 'vdiff', a: 'n1', b: 'n2' }, color: '#111' },
      input(),
    )

    expect(t).toMatchObject({ key: 'd:n1-n2', color: '#ffffff', values: [1, 3, 1] })
  })

  test('is null when the data is not there yet', () => {
    expect(
      buildDrawTrace({ expr: { kind: 'v', node: 'gone' }, color: '#111' }, input()),
    ).toBeNull()
  })
})

describe('buildDrawTraces', () => {
  test('skips traces with no data instead of drawing garbage', () => {
    const traces = buildDrawTraces(
      [
        { expr: { kind: 'v', node: 'n1' }, color: '#111' },
        { expr: { kind: 'i', block: 'gone' }, color: '#222' },
      ],
      input(),
    )

    expect(traces.map((t) => t.key)).toEqual(['v:n1'])
  })
})

describe('tracesOfUnit', () => {
  test('splits a pane into its left-axis and right-axis series', () => {
    const mixed = buildDrawTraces(
      [
        { expr: { kind: 'v', node: 'n1' }, color: '#111' },
        { expr: { kind: 'i', block: 'b1' }, color: '#222' },
      ],
      input(),
    )

    expect(tracesOfUnit(mixed, 'V').map((t) => t.key)).toEqual(['v:n1'])
    expect(tracesOfUnit(mixed, 'A').map((t) => t.key)).toEqual(['i:b1'])
    expect(tracesOfUnit(mixed, 'W')).toEqual([])
  })
})
