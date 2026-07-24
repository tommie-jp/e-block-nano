import { describe, expect, test } from 'vitest'
import { edgeKey, parseEdgeKey } from './edgeKey'

describe('edgeKey', () => {
  test('round-trips through parseEdgeKey', () => {
    const cell = { row: 2, col: 3 }
    expect(parseEdgeKey(edgeKey(cell, 'N'))).toEqual({ axis: 'H', row: 2, col: 3 })
    expect(parseEdgeKey(edgeKey(cell, 'S'))).toEqual({ axis: 'H', row: 3, col: 3 })
    expect(parseEdgeKey(edgeKey(cell, 'W'))).toEqual({ axis: 'V', row: 2, col: 3 })
    expect(parseEdgeKey(edgeKey(cell, 'E'))).toEqual({ axis: 'V', row: 2, col: 4 })
  })

  test('returns null for malformed keys', () => {
    expect(parseEdgeKey('')).toBeNull()
    expect(parseEdgeKey('X:1,2')).toBeNull()
    expect(parseEdgeKey('H:1')).toBeNull()
    expect(parseEdgeKey('blk-1')).toBeNull()
  })
})
