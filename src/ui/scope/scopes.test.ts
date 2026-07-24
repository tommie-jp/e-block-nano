import { describe, expect, it } from 'vitest'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import {
  appendScope,
  makeScope,
  removeScope,
  unionVisibleIds,
  withHiddenToggled,
  withReference,
} from './scopes'

const wf: Waveforms = { time: [0, 1], nodeVoltages: { N1: [1, 1] } }

describe('makeScope', () => {
  it('starts with all channels shown and no reference', () => {
    const s = makeScope('scope-1')
    expect(s).toEqual({ id: 'scope-1', hidden: [], reference: null })
  })
})

describe('appendScope / removeScope', () => {
  it('appends without mutating the input', () => {
    const base = [makeScope('a')]
    const next = appendScope(base, 'b')
    expect(next.map((s) => s.id)).toEqual(['a', 'b'])
    expect(base).toHaveLength(1) // immutable
  })

  it('removes the matching id', () => {
    const list = [makeScope('a'), makeScope('b')]
    expect(removeScope(list, 'a').map((s) => s.id)).toEqual(['b'])
  })
})

describe('withHiddenToggled', () => {
  it('hides then shows a node, returning new objects each time', () => {
    const s0 = makeScope('a')
    const s1 = withHiddenToggled(s0, 'N2')
    expect(s1.hidden).toEqual(['N2'])
    expect(s0.hidden).toEqual([]) // immutable

    const s2 = withHiddenToggled(s1, 'N2')
    expect(s2.hidden).toEqual([])
  })
})

describe('withReference', () => {
  it('sets and clears the reference immutably', () => {
    const s0 = makeScope('a')
    const s1 = withReference(s0, wf)
    expect(s1.reference).toBe(wf)
    expect(s0.reference).toBeNull()
    expect(withReference(s1, null).reference).toBeNull()
  })
})

describe('unionVisibleIds', () => {
  const allIds = ['N1', 'N2', 'N3']

  it('returns ids visible in at least one scope, in allIds order', () => {
    const a = withHiddenToggled(makeScope('a'), 'N3') // shows N1,N2
    const b = withHiddenToggled(makeScope('b'), 'N1') // shows N2,N3
    expect(unionVisibleIds([a, b], allIds)).toEqual(['N1', 'N2', 'N3'])
  })

  it('drops a node only when every scope hides it', () => {
    const a = withHiddenToggled(makeScope('a'), 'N2') // shows N1,N3
    const b = withHiddenToggled(makeScope('b'), 'N2') // shows N1,N3
    expect(unionVisibleIds([a, b], allIds)).toEqual(['N1', 'N3'])
  })

  it('returns nothing when there are no scopes', () => {
    expect(unionVisibleIds([], allIds)).toEqual([])
  })
})
