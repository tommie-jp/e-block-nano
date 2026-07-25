import { describe, expect, test } from 'vitest'
import { parseExpr } from './parseExpr'
import { evalExpr, unitOf } from './traceExpr'

/** N1/N2 はノード、blk-1 は素子 (プローブ一覧が出す名前と同じ) */
const symbols = {
  node: (name: string) => (name === 'N1' ? 'n1' : name === 'N2' ? 'n2' : null),
  block: (name: string) => (name === 'blk-1' ? 'b1' : null),
  terminals: (block: string) =>
    block === 'b1' ? { a: 'n1', b: 'n2' } : null,
}

const parsed = (text: string) => {
  const r = parseExpr(text, symbols)
  if ('error' in r) throw new Error(`parse failed: ${r.error}`)
  return r.expr
}

describe('parseExpr — 素の量', () => {
  test('V(node) becomes a node voltage', () => {
    expect(parsed('V(N1)')).toEqual({ kind: 'v', node: 'n1' })
  })

  test('V(a,b) becomes a differential', () => {
    expect(parsed('V(N1,N2)')).toEqual({ kind: 'vdiff', a: 'n1', b: 'n2' })
  })

  test('I(block) becomes an element current', () => {
    expect(parsed('I(blk-1)')).toEqual({ kind: 'i', block: 'b1' })
  })

  test('P(block) carries the terminals so it can be evaluated alone', () => {
    expect(parsed('P(blk-1)')).toEqual({ kind: 'p', block: 'b1', a: 'n1', b: 'n2' })
  })

  test('is not case sensitive on the function letter', () => {
    expect(parsed('v(N1)')).toEqual({ kind: 'v', node: 'n1' })
  })
})

describe('parseExpr — 式', () => {
  test('multiplies two quantities', () => {
    expect(parsed('V(N1)*I(blk-1)')).toEqual({
      kind: 'bin',
      op: '*',
      left: { kind: 'v', node: 'n1' },
      right: { kind: 'i', block: 'b1' },
    })
  })

  test('respects precedence and parentheses', () => {
    const a = parsed('V(N1)+V(N2)*2')
    const b = parsed('(V(N1)+V(N2))*2')

    expect(a).toEqual({
      kind: 'bin',
      op: '+',
      left: { kind: 'v', node: 'n1' },
      right: {
        kind: 'bin',
        op: '*',
        left: { kind: 'v', node: 'n2' },
        right: { kind: 'const', value: 2 },
      },
    })
    expect(b.kind).toBe('bin')
    expect(b).not.toEqual(a)
  })

  test('supports abs / sqrt / d (時間微分)', () => {
    expect(parsed('abs(V(N1))').kind).toBe('fn')
    expect(parsed('sqrt(V(N1))')).toMatchObject({ fn: 'sqrt' })
    expect(parsed('d(V(N1))')).toMatchObject({ fn: 'd' })
  })

  test('accepts decimals and unary minus', () => {
    expect(parsed('-0.5*V(N1)')).toMatchObject({ op: '*' })
  })
})

describe('parseExpr — エラー', () => {
  const err = (text: string): string => {
    const r = parseExpr(text, symbols)
    return 'error' in r ? r.error : 'no error'
  }

  test('an unknown node is reported by name', () => {
    expect(err('V(N9)')).toContain('N9')
  })

  test('an unknown element is reported by name', () => {
    expect(err('I(nope)')).toContain('nope')
  })

  test('power needs a two-terminal element', () => {
    expect(err('P(N1)')).toContain('N1')
  })

  test('a syntax error mentions where it broke', () => {
    expect(err('V(N1)*')).not.toBe('no error')
    expect(err('')).not.toBe('no error')
    expect(err('V N1)')).not.toBe('no error')
  })

  test('trailing junk is an error, not silently ignored', () => {
    expect(err('V(N1) foo')).not.toBe('no error')
  })
})

describe('式の評価と単位', () => {
  const waveforms = {
    time: [0, 1, 2],
    nodeVoltages: { n1: [2, 4, 6], n2: [1, 1, 1] },
    elementCurrents: { b1: [0.5, 0.5, 0.5] },
  }

  test('V*I is power', () => {
    const e = parsed('V(N1)*I(blk-1)')

    expect(unitOf(e)).toBe('W')
    expect(evalExpr(e, waveforms)).toEqual([1, 2, 3])
  })

  test('a sum keeps the unit of its operands', () => {
    expect(unitOf(parsed('V(N1)+V(N2)'))).toBe('V')
    expect(evalExpr(parsed('V(N1)+V(N2)'), waveforms)).toEqual([3, 5, 7])
  })

  test('scaling by a number keeps the unit', () => {
    expect(unitOf(parsed('V(N1)*2'))).toBe('V')
    expect(evalExpr(parsed('V(N1)*2'), waveforms)).toEqual([4, 8, 12])
  })

  test('a ratio has no unit of its own', () => {
    expect(unitOf(parsed('V(N1)/V(N2)'))).toBe('x')
  })

  test('abs keeps the unit, d() differentiates over time', () => {
    expect(unitOf(parsed('abs(V(N1))'))).toBe('V')
    // n1 は 1 秒あたり +2V
    expect(evalExpr(parsed('d(V(N1))'), waveforms)).toEqual([2, 2, 2])
  })

  test('dividing by zero does not produce NaN points', () => {
    const zero = { ...waveforms, nodeVoltages: { ...waveforms.nodeVoltages, n2: [0, 0, 0] } }

    const values = evalExpr(parsed('V(N1)/V(N2)'), zero)

    expect(values?.every((v) => Number.isFinite(v))).toBe(true)
  })
})
