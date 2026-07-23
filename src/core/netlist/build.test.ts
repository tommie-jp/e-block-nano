import { describe, expect, test } from 'vitest'
import {
  createBoard,
  placeBlock,
  rotateBlock,
  toggleSwitch,
} from '../grid/board'
import { buildNetlist } from './build'

describe('buildNetlist nets', () => {
  test('returns no nets or elements for an empty board', () => {
    const nl = buildNetlist(createBoard(6, 8))
    expect(nl.nets).toHaveLength(0)
    expect(nl.elements).toHaveLength(0)
  })

  test('joins two vertically adjacent straight wires into one net', () => {
    // Arrange: wire-i は N-S 導通。縦に並べると境界の辺を共有する
    let board = createBoard(6, 8)
    board = placeBlock(board, 'wire-i', { row: 0, col: 0 })
    board = placeBlock(board, 'wire-i', { row: 1, col: 0 })

    // Act
    const { nets } = buildNetlist(board)

    // Assert: N(0,0)–[共有辺]–S(1,0) が 1 ネットに繋がる
    const joined = nets.find((n) => n.terminals.length === 4)
    expect(joined).toBeDefined()
  })

  test('does not join blocks that only touch at unconnected edges', () => {
    let board = createBoard(6, 8)
    board = placeBlock(board, 'wire-i', { row: 0, col: 0 })
    board = placeBlock(board, 'wire-i', { row: 0, col: 1 })

    const { nets } = buildNetlist(board)

    expect(nets.every((n) => n.terminals.length <= 2)).toBe(true)
  })

  test('respects block orientation for wires', () => {
    // wire-i (N-S) を 90° 回すと E-W 導通になり、横並びで繋がる
    let board = createBoard(6, 8)
    board = placeBlock(board, 'wire-i', { row: 0, col: 0 })
    board = placeBlock(board, 'wire-i', { row: 0, col: 1 })
    const [a, b] = board.placements.map((p) => p.blockId)
    board = rotateBlock(board, a)
    board = rotateBlock(board, b)

    const { nets } = buildNetlist(board)

    const joined = nets.find((n) => n.terminals.length === 4)
    expect(joined).toBeDefined()
  })
})

describe('buildNetlist elements', () => {
  test('a resistor is a device whose two pins are distinct nodes (not shorted)', () => {
    const board = placeBlock(createBoard(6, 8), 'resistor-1k', {
      row: 2,
      col: 2,
    })

    const { nets, elements } = buildNetlist(board)

    expect(elements).toHaveLength(1)
    const [r] = elements
    expect(r.device.kind).toBe('resistor')
    // 両端が別ノード = 導線として潰れていない
    expect(r.pinNodes.a).not.toBe(r.pinNodes.b)
    // 何にも繋がっていないので 2 つの独立ネット (各 1 端子)
    expect(nets).toHaveLength(2)
    expect(nets.every((n) => n.terminals.length === 1)).toBe(true)
  })

  test('a device pin shares a node with an adjacent wire terminal', () => {
    // wire-i(0,0) の S辺(H:1,0) と resistor(1,0) の a=N辺(H:1,0) が同一辺
    let board = createBoard(6, 8)
    board = placeBlock(board, 'wire-i', { row: 0, col: 0 })
    board = placeBlock(board, 'resistor-1k', { row: 1, col: 0 })
    const wireId = board.placements[0].blockId

    const { nets, elements } = buildNetlist(board)
    const [r] = elements

    // resistor.a が繋がるノードに、wire の端子も同居している
    const sharedNet = nets.find((n) => n.nodeId === r.pinNodes.a)
    expect(sharedNet).toBeDefined()
    expect(sharedNet?.terminals.some((t) => t.blockId === wireId)).toBe(true)
    // b 側は誰とも繋がらない別ノード
    expect(r.pinNodes.b).not.toBe(r.pinNodes.a)
  })

  test('ground node is the first battery minus terminal', () => {
    const board = placeBlock(createBoard(6, 8), 'battery-3v', {
      row: 2,
      col: 2,
    })

    const { elements, groundNode, nets } = buildNetlist(board)
    const battery = elements.find((e) => e.device.kind === 'battery')

    expect(groundNode).toBe(battery?.pinNodes.minus)
    // 基準ノードは実在するネットの nodeId を指す
    expect(nets.some((n) => n.nodeId === groundNode)).toBe(true)
    // 電池の plus/minus は別ノード
    expect(battery?.pinNodes.plus).not.toBe(groundNode)
  })

  test('ground node is null without a battery', () => {
    const board = placeBlock(createBoard(6, 8), 'resistor-1k', {
      row: 0,
      col: 0,
    })

    expect(buildNetlist(board).groundNode).toBeNull()
  })

  test('a switch element carries its closed state, pins stay distinct', () => {
    let board = placeBlock(createBoard(6, 8), 'switch', { row: 0, col: 0 })
    const id = board.placements[0].blockId

    // 既定 (開): state は無く、両ピンは別ノード (トポロジは状態非依存)
    const open = buildNetlist(board).elements[0]
    expect(open.device.kind).toBe('switch')
    expect(open.state?.closed ?? false).toBe(false)
    expect(open.pinNodes.a).not.toBe(open.pinNodes.b)

    // 閉じても union はせず、closed 状態だけが Element に載る
    board = toggleSwitch(board, id)
    const closed = buildNetlist(board).elements[0]
    expect(closed.state?.closed).toBe(true)
    expect(closed.pinNodes.a).not.toBe(closed.pinNodes.b)
  })

  test('transistor pins map through orientation', () => {
    // 向き 0: collector=N, base=E, emitter=S
    let board = placeBlock(createBoard(6, 8), 'transistor-npn', {
      row: 2,
      col: 2,
    })
    const base = buildNetlist(board).elements[0]
    expect(base.device.kind).toBe('transistor-npn')
    const baseNodes = new Set(Object.values(base.pinNodes))
    expect(baseNodes.size).toBe(3)

    // 90° 回転で各ピンの実辺が時計回りに 1 段ずれる → 節点集合が変わる
    board = rotateBlock(board, board.placements[0].blockId)
    const rotated = buildNetlist(board).elements[0]
    expect(new Set(Object.values(rotated.pinNodes)).size).toBe(3)
    expect(rotated.pinNodes.collector).not.toBe(base.pinNodes.collector)
  })
})
