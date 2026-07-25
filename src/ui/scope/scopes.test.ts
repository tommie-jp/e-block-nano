import { describe, expect, it } from 'vitest'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { syncNodes, toggleVisibleExpr } from './panes'
import {
  appendScope,
  makeScope,
  removeScope,
  unionVisibleIds,
  withLayout,
  withReference,
} from './scopes'

/** 指定ノードを表示中にしたスコープ (v トレースを持つ) */
const scopeShowing = (id: string, nodeIds: string[]) =>
  withLayout(makeScope(id), (l) => syncNodes(l, nodeIds))

/** そのノードの表示を消したスコープ */
const scopeHiding = (id: string, nodeIds: string[], hide: string) =>
  withLayout(scopeShowing(id, nodeIds), (l) =>
    toggleVisibleExpr(l, { kind: 'v', node: hide }),
  )

const wf: Waveforms = { time: [0, 1], nodeVoltages: { N1: [1, 1] } }

describe('makeScope', () => {
  it('starts with an empty layout and no reference', () => {
    const s = makeScope('scope-1')

    expect(s.id).toBe('scope-1')
    expect(s.layout.traces).toEqual([])
    expect(s.layout.panes).toHaveLength(1)
    expect(s.reference).toBeNull()
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

describe('withLayout', () => {
  it('updates the layout immutably', () => {
    const s0 = scopeShowing('a', ['N1'])

    const s1 = withLayout(s0, (l) => toggleVisibleExpr(l, { kind: 'v', node: 'N1' }))

    expect(s1.layout.traces[0].visible).toBe(false)
    expect(s0.layout.traces[0].visible).toBe(true) // immutable
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
    const a = scopeHiding('a', allIds, 'N3') // shows N1,N2
    const b = scopeHiding('b', allIds, 'N1') // shows N2,N3

    expect(unionVisibleIds([a, b], allIds)).toEqual(['N1', 'N2', 'N3'])
  })

  it('drops a node only when every scope hides it', () => {
    const a = scopeHiding('a', allIds, 'N2')
    const b = scopeHiding('b', allIds, 'N2')

    expect(unionVisibleIds([a, b], allIds)).toEqual(['N1', 'N3'])
  })

  it('returns nothing when there are no scopes', () => {
    expect(unionVisibleIds([], allIds)).toEqual([])
  })
})
