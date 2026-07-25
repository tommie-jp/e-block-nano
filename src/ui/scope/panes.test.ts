import { describe, expect, test } from 'vitest'
import type { TraceExpr } from '../../core/scope/traceExpr'
import {
  addPane,
  addTrace,
  axisOf,
  createLayout,
  moveTrace,
  paneTraces,
  paneUnits,
  removePane,
  removeTrace,
  syncLayout,
  toggleTraceExpr,
  toggleVisible,
} from './panes'

const V1: TraceExpr = { kind: 'v', node: 'n1' }
const V2: TraceExpr = { kind: 'v', node: 'n2' }
const I1: TraceExpr = { kind: 'i', block: 'r1' }
const P1: TraceExpr = { kind: 'p', block: 'r1', a: 'n1', b: 'n2' }

describe('createLayout', () => {
  test('starts with a single empty pane', () => {
    const l = createLayout()

    expect(l.panes).toHaveLength(1)
    expect(l.traces).toHaveLength(0)
  })
})

describe('addTrace', () => {
  test('puts the first trace in the first pane on the left axis', () => {
    const l = addTrace(createLayout(), V1)

    expect(l.traces).toHaveLength(1)
    expect(l.traces[0].paneId).toBe(l.panes[0].id)
    expect(axisOf(l, l.traces[0].id)).toBe('left')
  })

  test('a second unit in the same pane goes to the right axis', () => {
    const l = addTrace(addTrace(createLayout(), V1), I1)

    expect(l.panes).toHaveLength(1)
    expect(axisOf(l, l.traces[1].id)).toBe('right')
    expect(paneUnits(l, l.panes[0].id)).toEqual(['V', 'A'])
  })

  test('a third unit opens a new pane instead of lying about the axis', () => {
    const l = addTrace(addTrace(addTrace(createLayout(), V1), I1), P1)

    expect(l.panes).toHaveLength(2)
    expect(l.traces[2].paneId).toBe(l.panes[1].id)
    expect(axisOf(l, l.traces[2].id)).toBe('left')
  })

  test('same-unit traces share the axis', () => {
    const l = addTrace(addTrace(createLayout(), V1), V2)

    expect(l.panes).toHaveLength(1)
    expect(axisOf(l, l.traces[1].id)).toBe('left')
  })

  test('gives traces of the same unit different colors', () => {
    const l = addTrace(addTrace(createLayout(), V1), V2)

    expect(l.traces[0].color).not.toBe(l.traces[1].color)
  })

  test('adding the same expression twice is a no-op', () => {
    const once = addTrace(createLayout(), V1)

    expect(addTrace(once, { kind: 'v', node: 'n1' }).traces).toHaveLength(1)
  })

  test('does not mutate the input layout', () => {
    const l = createLayout()
    addTrace(l, V1)

    expect(l.traces).toHaveLength(0)
  })
})

describe('toggleTraceExpr', () => {
  test('adds when absent and removes when present', () => {
    const on = toggleTraceExpr(createLayout(), I1)
    expect(on.traces).toHaveLength(1)

    expect(toggleTraceExpr(on, { kind: 'i', block: 'r1' }).traces).toHaveLength(0)
  })
})

describe('removeTrace / toggleVisible', () => {
  test('removeTrace drops just that trace', () => {
    const l = addTrace(addTrace(createLayout(), V1), V2)

    const after = removeTrace(l, l.traces[0].id)

    expect(after.traces.map((t) => t.expr)).toEqual([V2])
  })

  test('toggleVisible flips only the visible flag', () => {
    const l = addTrace(createLayout(), V1)

    const hidden = toggleVisible(l, l.traces[0].id)

    expect(hidden.traces[0].visible).toBe(false)
    expect(toggleVisible(hidden, l.traces[0].id).traces[0].visible).toBe(true)
  })
})

describe('panes', () => {
  test('addPane appends an empty pane', () => {
    const l = addPane(createLayout())

    expect(l.panes).toHaveLength(2)
    expect(paneTraces(l, l.panes[1].id)).toHaveLength(0)
  })

  test('removePane drops the pane and the traces it held', () => {
    // 2 枚目を明示指定で使う (指定しなければ W は 1 枚目の右軸に入るため)
    const withPane = addPane(addTrace(createLayout(), V1))
    const two = addTrace(withPane, P1, withPane.panes[1].id)
    expect(paneTraces(two, withPane.panes[1].id)).toHaveLength(1)

    const after = removePane(two, two.panes[1].id)

    expect(after.panes).toHaveLength(1)
    expect(after.traces.map((t) => t.expr)).toEqual([V1])
  })

  test('the last pane cannot be removed', () => {
    const l = addTrace(createLayout(), V1)

    expect(removePane(l, l.panes[0].id)).toBe(l)
  })

  test('moveTrace re-assigns a trace to another pane', () => {
    const l = addPane(addTrace(createLayout(), V1))

    const after = moveTrace(l, l.traces[0].id, l.panes[1].id)

    expect(paneTraces(after, l.panes[1].id).map((t) => t.expr)).toEqual([V1])
    expect(paneTraces(after, l.panes[0].id)).toHaveLength(0)
  })

  test('moveTrace refuses a pane that already uses two other units', () => {
    // ペイン0 = V+A、ペイン1 = W。W をペイン0 に入れると 3 単位目になる
    const l = addTrace(addTrace(addTrace(createLayout(), V1), I1), P1)
    const power = l.traces[2]

    expect(moveTrace(l, power.id, l.panes[0].id)).toBe(l)
  })
})

describe('syncLayout', () => {
  test('adds traces for expressions that appeared', () => {
    const l = syncLayout(createLayout(), [V1, I1])

    expect(l.traces.map((t) => t.expr)).toEqual([V1, I1])
  })

  test('drops traces whose expression is gone (probe removed / node vanished)', () => {
    const before = syncLayout(createLayout(), [V1, I1])

    expect(syncLayout(before, [V1]).traces.map((t) => t.expr)).toEqual([V1])
  })

  test('keeps the pane a trace was moved to', () => {
    const moved = (() => {
      const l = addPane(syncLayout(createLayout(), [V1]))
      return moveTrace(l, l.traces[0].id, l.panes[1].id)
    })()

    const after = syncLayout(moved, [V1, I1])

    expect(after.traces[0].paneId).toBe(moved.panes[1].id)
  })

  test('is a no-op when nothing changed (same object back)', () => {
    const l = syncLayout(createLayout(), [V1])

    expect(syncLayout(l, [V1])).toBe(l)
  })
})
