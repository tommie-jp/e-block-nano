import { describe, expect, test } from 'vitest'
import { paneHeight, panesForRender, zoomRange } from './paneLayout'
import { addPane, addTrace, createLayout, moveTrace, setPaneYRange } from './panes'
import type { DrawTrace } from './traceSeries'

const WIN = { start: 0, end: 1 }
const EMPTY = { min: 0, max: 3 }

const vTrace = (node: string, values: number[]): DrawTrace => ({
  expr: { kind: 'v', node },
  key: `v:${node}`,
  label: node.toUpperCase(),
  color: '#4fc3f7',
  constant: false,
  values,
})
const iTrace = (block: string, values: number[]): DrawTrace => ({
  expr: { kind: 'i', block },
  key: `i:${block}`,
  label: block,
  color: '#ffd54f',
  constant: false,
  values,
})

describe('paneHeight', () => {
  test('shrinks each pane as panes are added so the page does not run away', () => {
    expect(paneHeight(1)).toBeGreaterThan(paneHeight(2))
    expect(paneHeight(2)).toBeGreaterThan(paneHeight(3))
    expect(paneHeight(5)).toBe(paneHeight(3))
  })
})

describe('zoomRange', () => {
  test('×1 leaves the range alone', () => {
    expect(zoomRange({ min: -1, max: 3 }, 1)).toEqual({ min: -1, max: 3 })
  })

  test('a bigger gain tightens the range around 0 (the baseline stays put)', () => {
    expect(zoomRange({ min: -2, max: 4 }, 2)).toEqual({ min: -1, max: 2 })
  })
})

describe('panesForRender', () => {
  test('a voltage-only pane draws on the left axis with no right axis', () => {
    const layout = addTrace(createLayout(), { kind: 'v', node: 'n1' })

    const [pane] = panesForRender(layout, [vTrace('n1', [0, 2])], WIN, 240, 1, EMPTY)

    expect(pane.leftUnit).toBe('V')
    expect(pane.rightUnit).toBeNull()
    expect(pane.rightAxis).toBeUndefined()
    expect(pane.scales.yRange).toEqual({ min: 0, max: 2 })
  })

  test('a second unit becomes the right axis, converted to display units', () => {
    const layout = addTrace(addTrace(createLayout(), { kind: 'v', node: 'n1' }), {
      kind: 'i',
      block: 'r1',
    })

    const [pane] = panesForRender(
      layout,
      [vTrace('n1', [0, 2]), iTrace('r1', [0, 0.002])],
      WIN,
      240,
      1,
      EMPTY,
    )

    expect(pane.rightUnit).toBe('A')
    expect(pane.rightScale).toBe(1000)
    expect(pane.rightAxis).toEqual({ min: 0, max: 2, unit: 'mA' }) // 0.002A → 2mA
  })

  test('an empty pane still has a drawable range', () => {
    const layout = addPane(createLayout())

    const panes = panesForRender(layout, [], WIN, 170, 1, EMPTY)

    expect(panes).toHaveLength(2)
    expect(panes[1].traces).toHaveLength(0)
    expect(panes[1].scales.yRange).toEqual(EMPTY)
  })

  test('each pane ranges on its own traces after a move', () => {
    const base = addTrace(addTrace(createLayout(), { kind: 'v', node: 'n1' }), {
      kind: 'v',
      node: 'n2',
    })
    const withPane = addPane(base)
    const moved = moveTrace(withPane, withPane.traces[1].id, withPane.panes[1].id)

    const panes = panesForRender(
      moved,
      [vTrace('n1', [0, 1]), vTrace('n2', [0, 9])],
      WIN,
      170,
      1,
      EMPTY,
    )

    expect(panes[0].scales.yRange).toEqual({ min: 0, max: 1 })
    expect(panes[1].scales.yRange).toEqual({ min: 0, max: 9 })
  })

  test('a manual Y range wins over the automatic one', () => {
    const layout = setPaneYRange(
      addTrace(createLayout(), { kind: 'v', node: 'n1' }),
      'pane-1',
      { min: -5, max: 5 },
    )

    const [pane] = panesForRender(layout, [vTrace('n1', [0, 2])], WIN, 240, 1, EMPTY)

    expect(pane.scales.yRange).toEqual({ min: -5, max: 5 })
  })

  test('the gain zooms only the automatic range', () => {
    const layout = addTrace(createLayout(), { kind: 'v', node: 'n1' })

    const [pane] = panesForRender(layout, [vTrace('n1', [0, 4])], WIN, 240, 2, EMPTY)

    expect(pane.scales.yRange).toEqual({ min: 0, max: 2 })
  })

  test('a trace with no data yet is skipped, not drawn as garbage', () => {
    const layout = addTrace(createLayout(), { kind: 'v', node: 'gone' })

    const [pane] = panesForRender(layout, [], WIN, 240, 1, EMPTY)

    expect(pane.traces).toHaveLength(0)
  })
})
