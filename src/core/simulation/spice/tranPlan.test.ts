import { describe, expect, test } from 'vitest'
import type { Element, Netlist } from '../../netlist/build'
import { DEFAULT_TRAN, tranPlanFor } from './tranPlan'

const netlist = (elements: readonly Element[]): Netlist => ({
  nets: [],
  elements,
  nodeOfEdge: {},
  groundNode: 'gnd',
})

const resistor: Element = {
  blockId: 'r1',
  device: { kind: 'resistor', ohms: 1000, pins: { a: 'N', b: 'S' } },
  pinNodes: { a: 'n1', b: 'gnd' },
}

const npn: Element = {
  blockId: 'q1',
  device: {
    kind: 'transistor-npn',
    model: '2SC1815',
    pins: { collector: 'N', base: 'E', emitter: 'S' },
  },
  pinNodes: { collector: 'n1', base: 'n2', emitter: 'gnd' },
}

const sine = (blockId: string, hertz: number): Element => ({
  blockId,
  device: {
    kind: 'ac-source',
    wave: { kind: 'sin', offsetVolts: 0, amplitudeVolts: 0.01, hertz },
    pins: { plus: 'N', minus: 'S' },
  },
  pinNodes: { plus: 'n1', minus: 'gnd' },
})

const pulse: Element = {
  blockId: 'trig1',
  device: {
    kind: 'ac-source',
    wave: {
      kind: 'pulse',
      lowVolts: 0,
      highVolts: 3,
      delaySeconds: 0.02,
      widthSeconds: 0.2,
      periodSeconds: 10,
    },
    pins: { plus: 'N', minus: 'S' },
  },
  pinNodes: { plus: 'n1', minus: 'gnd' },
}

describe('tranPlanFor', () => {
  test('信号源が無い回路は従来の窓 (0.02s 刻み / 5s) を使う', () => {
    const plan = tranPlanFor(netlist([resistor]))
    expect(plan.step).toBe(DEFAULT_TRAN.step)
    expect(plan.stop).toBe(DEFAULT_TRAN.stop)
    expect(plan.startup).toBe('zero-state')
  })

  test('信号源が無くトランジスタがある回路はキック付き (04 の発振を維持)', () => {
    expect(tranPlanFor(netlist([npn, resistor])).startup).toBe('uic-kick')
  })

  test('正弦波源があれば 5 周期分の窓と動作点起動にする', () => {
    const plan = tranPlanFor(netlist([sine('src1', 1000), npn]))
    // 1kHz → 5 周期 = 5ms、1 周期 200 点
    expect(plan.stop).toBeCloseTo(5e-3, 9)
    expect(plan.step).toBeCloseTo(5e-6, 12)
    // 外部から駆動される回路はバイアス点から始める (キックしない)
    expect(plan.startup).toBe('operating-point')
  })

  test('複数の正弦波源では 窓=最低周波数 / 刻み=最高周波数 に合わせる', () => {
    const plan = tranPlanFor(netlist([sine('src1', 1000), sine('src2', 4000)]))
    expect(plan.stop).toBeCloseTo(5e-3, 9) // 5 / 1kHz
    expect(plan.step).toBeCloseTo(1.25e-6, 12) // 1 / (200 × 4kHz)
  })

  test('パルス源は「トリガ開始 → 幅の 1.5 倍後」まで映す', () => {
    const plan = tranPlanFor(netlist([pulse, resistor]))
    expect(plan.startup).toBe('operating-point')
    // delay 20ms + width 200ms × 1.5 = 320ms、刻みは 1/1000
    expect(plan.stop).toBeCloseTo(0.32, 9)
    expect(plan.step).toBeCloseTo(3.2e-4, 9)
  })
})
