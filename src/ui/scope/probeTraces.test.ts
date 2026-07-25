import { describe, expect, test } from 'vitest'
import {
  diffNodes,
  probedCurrents,
  toggleHidden,
  toggleTrace,
  traceKey,
} from './probeTraces'
import type { ProbeTrace } from './probeTraces'

const current = (blockId: string): ProbeTrace => ({ kind: 'current', blockId })

describe('toggleTrace', () => {
  test('adds a trace that is not in the list', () => {
    expect(toggleTrace([], current('b1'))).toEqual([current('b1')])
  })

  test('removes a trace that is already in the list', () => {
    expect(toggleTrace([current('b1'), current('b2')], current('b1'))).toEqual([
      current('b2'),
    ])
  })

  test('does not mutate the input list', () => {
    const list: ProbeTrace[] = [current('b1')]
    toggleTrace(list, current('b2'))

    expect(list).toEqual([current('b1')])
  })

  test('a new differential replaces the previous one (only one at a time)', () => {
    const list = toggleTrace([current('b1'), { kind: 'diff', a: 'n1', b: 'n2' }], {
      kind: 'diff',
      a: 'n3',
      b: 'n4',
    })

    expect(list).toEqual([current('b1'), { kind: 'diff', a: 'n3', b: 'n4' }])
  })

  test('toggling the same differential again removes it', () => {
    const diff = { kind: 'diff', a: 'n1', b: 'n2' } as const

    expect(toggleTrace([diff], diff)).toEqual([])
  })
})

describe('traceKey', () => {
  test('is stable per kind and target', () => {
    expect(traceKey(current('b1'))).toBe(traceKey(current('b1')))
    expect(traceKey(current('b1'))).not.toBe(
      traceKey({ kind: 'diff', a: 'b1', b: 'n2' }),
    )
  })
})

describe('toggleHidden', () => {
  test('hides a node that is currently shown', () => {
    expect([...toggleHidden(new Set(), 'n1')]).toEqual(['n1'])
  })

  test('shows a node that is currently hidden', () => {
    expect([...toggleHidden(new Set(['n1', 'n2']), 'n1')]).toEqual(['n2'])
  })

  test('does not mutate the input set', () => {
    const hidden = new Set(['n1'])
    toggleHidden(hidden, 'n2')

    expect([...hidden]).toEqual(['n1'])
  })
})

describe('probedCurrents', () => {
  const all = { b1: [1, 2], b2: [3, 4] }

  test('keeps only the elements with a current probe', () => {
    expect(probedCurrents([current('b1')], all)).toEqual({ b1: [1, 2] })
  })

  test('is empty when nothing is probed (currents are opt-in)', () => {
    expect(probedCurrents([{ kind: 'diff', a: 'n1', b: 'n2' }], all)).toEqual({})
  })

  test('ignores a probe whose element has no data yet', () => {
    expect(probedCurrents([current('gone')], all)).toEqual({})
  })
})

describe('diffNodes', () => {
  test('returns the differential pair with a readable label', () => {
    expect(diffNodes([current('b1'), { kind: 'diff', a: 'n1', b: 'n2' }])).toEqual({
      a: 'n1',
      b: 'n2',
      label: 'M: n1−n2',
    })
  })

  test('returns null without a differential trace', () => {
    expect(diffNodes([current('b1')])).toBeNull()
  })
})
