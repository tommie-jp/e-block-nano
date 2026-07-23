import { describe, expect, test } from 'vitest'
import { lintCircuit } from '../core/lint/lintCircuit'
import { buildNetlist } from '../core/netlist/build'
import { deserializeBoard } from '../core/persistence/boardFile'
import { getSample, SAMPLE_CIRCUITS } from './circuits/samples'

/**
 * 個別サンプルではなくレジストリ全件に対する不変条件。
 * 今後追加するサンプルも自動的に検査対象になる。
 */
describe('SAMPLE_CIRCUITS registry', () => {
  test('is non-empty and includes the Lチカ sample', () => {
    expect(SAMPLE_CIRCUITS.length).toBeGreaterThan(0)
    expect(getSample('led-blink')?.name).toBe('Lチカ')
    expect(getSample('nope')).toBeUndefined()
  })

  test('every sample has a unique, non-empty id and name', () => {
    const ids = SAMPLE_CIRCUITS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SAMPLE_CIRCUITS) {
      expect(s.id).not.toBe('')
      expect(s.name).not.toBe('')
      expect(s.description).not.toBe('')
    }
  })

  test('every sample deserializes under the v1 schema', () => {
    for (const s of SAMPLE_CIRCUITS) {
      const board = deserializeBoard(JSON.stringify(s.data))
      expect(board.placements.length).toBeGreaterThan(0)
    }
  })

  test('every sample is a working circuit (zero lint errors)', () => {
    for (const s of SAMPLE_CIRCUITS) {
      const netlist = buildNetlist(deserializeBoard(JSON.stringify(s.data)))
      const errors = lintCircuit(netlist).filter((f) => f.severity === 'error')
      expect(errors, `${s.id} should have no lint errors`).toHaveLength(0)
    }
  })
})
