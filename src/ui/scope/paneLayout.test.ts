import { describe, expect, test } from 'vitest'
import { paneHeight, panesForRender, withHeadroom, zoomRange } from './paneLayout'
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

describe('withHeadroom', () => {
  test('opens the swinging side by 10% so the peak is not glued to the frame', () => {
    expect(withHeadroom({ min: 0, max: 10 })).toEqual({ min: 0, max: 11 })
  })

  test('keeps the 0 baseline where it is', () => {
    expect(withHeadroom({ min: 0, max: 10 }).min).toBe(0)
  })

  test('opens both sides when the trace goes negative', () => {
    expect(withHeadroom({ min: -10, max: 10 })).toEqual({ min: -12, max: 12 })
  })

  test('leaves a degenerate range alone', () => {
    expect(withHeadroom({ min: 1, max: 1 })).toEqual({ min: 1, max: 1 })
  })
})

describe('panesForRender', () => {
  test('a voltage-only pane draws on the left axis with no right axis', () => {
    const layout = addTrace(createLayout(), { kind: 'v', node: 'n1' })

    const [pane] = panesForRender(layout, [vTrace('n1', [0, 2])], WIN, 240, 1, EMPTY)

    expect(pane.leftUnit).toBe('V')
    expect(pane.rightUnit).toBeNull()
    expect(pane.rightAxis).toBeUndefined()
    expect(pane.scales.yRange).toEqual({ min: 0, max: 2.2 }) // 10% の余白つき
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
    expect(pane.rightAxis?.unit).toBe('mA')
    expect(pane.rightAxis?.max).toBeCloseTo(2.2) // 0.002A → 2mA ＋ 10% の余白
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

    expect(panes[0].scales.yRange.max).toBeCloseTo(1.1)
    expect(panes[1].scales.yRange.max).toBeCloseTo(9.9)
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

    expect(pane.scales.yRange.max).toBeCloseTo(2.2) // 4V を ×2 ズーム ＋ 余白
  })

  test('a trace with no data yet is skipped, not drawn as garbage', () => {
    const layout = addTrace(createLayout(), { kind: 'v', node: 'gone' })

    const [pane] = panesForRender(layout, [], WIN, 240, 1, EMPTY)

    expect(pane.traces).toHaveLength(0)
  })
})

describe('軸の SI 接頭辞', () => {
  test('a milliamp axis reads in mA', () => {
    const layout = addTrace(createLayout(), { kind: 'i', block: 'b1' })

    const [pane] = panesForRender(layout, [iTrace('b1', [0, 0.0012])], WIN, 240, 1, EMPTY)

    expect(pane.leftLabel).toBe('mA')
    expect(pane.leftScale).toBe(1000)
  })

  test('a microamp axis reads in µA (leak current)', () => {
    const layout = addTrace(createLayout(), { kind: 'i', block: 'b1' })

    const [pane] = panesForRender(layout, [iTrace('b1', [0, 1.5e-6])], WIN, 240, 1, EMPTY)

    expect(pane.leftLabel).toBe('µA')
    expect(pane.leftScale).toBe(1e6)
  })

  test('a volt-scale axis keeps V', () => {
    const layout = addTrace(createLayout(), { kind: 'v', node: 'n1' })

    const [pane] = panesForRender(layout, [vTrace('n1', [0, 3])], WIN, 240, 1, EMPTY)

    expect(pane.leftLabel).toBe('V')
    expect(pane.leftScale).toBe(1)
  })

  test('the right axis picks its own prefix, independent of the left', () => {
    const layout = addTrace(addTrace(createLayout(), { kind: 'v', node: 'n1' }), {
      kind: 'i',
      block: 'b1',
    })

    const [pane] = panesForRender(
      layout,
      [vTrace('n1', [0, 3]), iTrace('b1', [0, 2e-6])],
      WIN,
      240,
      1,
      EMPTY,
    )

    expect(pane.leftLabel).toBe('V')
    expect(pane.rightAxis?.unit).toBe('µA')
    expect(pane.rightAxis?.max).toBeCloseTo(2.2)
  })
})
