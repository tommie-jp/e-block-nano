import { describe, expect, test } from 'vitest'
import type { Waveforms } from '../simulation/spice/mapResult'
import { evalExpr, exprKey, exprLabel, unitOf } from './traceExpr'
import type { TraceExpr } from './traceExpr'

const waveforms: Waveforms = {
  time: [0, 1, 2],
  nodeVoltages: { n1: [3, 3, 3], n2: [1, 2, 3] },
  elementCurrents: { r1: [0.01, 0.02, 0.03] },
}

const v = (node: string): TraceExpr => ({ kind: 'v', node })

describe('unitOf', () => {
  test('maps each expression kind to its unit', () => {
    expect(unitOf(v('n1'))).toBe('V')
    expect(unitOf({ kind: 'vdiff', a: 'n1', b: 'n2' })).toBe('V')
    expect(unitOf({ kind: 'i', block: 'r1' })).toBe('A')
    expect(unitOf({ kind: 'p', block: 'r1', a: 'n1', b: 'n2' })).toBe('W')
  })
})

describe('exprKey', () => {
  test('is stable for the same expression', () => {
    expect(exprKey(v('n1'))).toBe(exprKey(v('n1')))
  })

  test('separates kinds that share an id', () => {
    expect(exprKey({ kind: 'i', block: 'x' })).not.toBe(
      exprKey({ kind: 'p', block: 'x', a: 'n1', b: 'n2' }),
    )
    expect(exprKey(v('x'))).not.toBe(exprKey({ kind: 'i', block: 'x' }))
  })

  test('treats a differential as ordered (V(a,b) ≠ V(b,a))', () => {
    expect(exprKey({ kind: 'vdiff', a: 'n1', b: 'n2' })).not.toBe(
      exprKey({ kind: 'vdiff', a: 'n2', b: 'n1' }),
    )
  })
})

describe('exprLabel', () => {
  const names = { nodes: { n1: 'N1', n2: 'N2' }, blocks: { r1: '抵抗' } }

  test('uses display names when available', () => {
    expect(exprLabel(v('n1'), names)).toBe('V(N1)')
    expect(exprLabel({ kind: 'vdiff', a: 'n1', b: 'n2' }, names)).toBe('V(N1,N2)')
    expect(exprLabel({ kind: 'i', block: 'r1' }, names)).toBe('I(抵抗)')
    expect(exprLabel({ kind: 'p', block: 'r1', a: 'n1', b: 'n2' }, names)).toBe('P(抵抗)')
  })

  test('falls back to raw ids without a name map', () => {
    expect(exprLabel(v('n1'))).toBe('V(n1)')
  })
})

describe('evalExpr', () => {
  test('a node voltage is its series', () => {
    expect(evalExpr(v('n1'), waveforms)).toEqual([3, 3, 3])
  })

  test('a differential subtracts elementwise', () => {
    expect(evalExpr({ kind: 'vdiff', a: 'n1', b: 'n2' }, waveforms)).toEqual([2, 1, 0])
  })

  test('an element current is its series', () => {
    expect(evalExpr({ kind: 'i', block: 'r1' }, waveforms)).toEqual([0.01, 0.02, 0.03])
  })

  test('power is the terminal voltage times the current', () => {
    // (3−1)*0.01, (3−2)*0.02, (3−3)*0.03
    expect(evalExpr({ kind: 'p', block: 'r1', a: 'n1', b: 'n2' }, waveforms)).toEqual([
      0.02, 0.02, 0,
    ])
  })

  test('returns null when the data is not there', () => {
    expect(evalExpr(v('missing'), waveforms)).toBeNull()
    expect(evalExpr({ kind: 'i', block: 'missing' }, waveforms)).toBeNull()
    expect(evalExpr({ kind: 'vdiff', a: 'n1', b: 'missing' }, waveforms)).toBeNull()
    expect(evalExpr({ kind: 'p', block: 'r1', a: 'n1', b: 'missing' }, waveforms)).toBeNull()
  })

  test('returns null for a current when the batch result carries no currents', () => {
    const noCurrents: Waveforms = { time: [0], nodeVoltages: { n1: [3] } }

    expect(evalExpr({ kind: 'i', block: 'r1' }, noCurrents)).toBeNull()
  })
})
