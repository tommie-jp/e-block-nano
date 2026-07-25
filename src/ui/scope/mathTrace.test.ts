import { describe, expect, test } from 'vitest'
import type { Netlist } from '../../core/netlist/build'
import { differenceSeries, selectedMathNodes } from './mathTrace'

const netlistWith = (elements: unknown[]): Netlist =>
  ({ nets: [], elements, groundNode: null }) as unknown as Netlist

describe('selectedMathNodes', () => {
  test('returns the two terminal nodes of a selected 2-terminal element', () => {
    const netlist = netlistWith([
      { blockId: 'r1', pinNodes: { a: 'N1', b: 'N2' } },
    ])
    expect(selectedMathNodes(netlist, 'r1')).toEqual({
      a: 'N1',
      b: 'N2',
      label: 'M: 両端電圧',
    })
  })

  test('null when unselected, not found, or terminals collapse to one node', () => {
    const netlist = netlistWith([
      { blockId: 'r1', pinNodes: { a: 'N1', b: 'N1' } }, // 短絡
      { blockId: 'q1', pinNodes: { c: 'N1', b: 'N2', e: 'N3' } }, // 3 端子
    ])
    expect(selectedMathNodes(netlist, null)).toBeNull()
    expect(selectedMathNodes(netlist, 'missing')).toBeNull()
    expect(selectedMathNodes(netlist, 'r1')).toBeNull()
    expect(selectedMathNodes(netlist, 'q1')).toBeNull()
  })
})

describe('differenceSeries', () => {
  test('subtracts pointwise', () => {
    expect(differenceSeries([3, 2, 1], [1, 1, 1])).toEqual([2, 1, 0])
  })

  test('treats missing b entries as 0', () => {
    expect(differenceSeries([3, 2], [1])).toEqual([2, 2])
  })
})
