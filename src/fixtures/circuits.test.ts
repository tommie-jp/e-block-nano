import { describe, expect, test } from 'vitest'
import { toggleSwitch } from '../core/grid/board'
import { lintCircuit } from '../core/lint/lintCircuit'
import { buildNetlist } from '../core/netlist/build'
import type { Element } from '../core/netlist/build'
import { deserializeBoard } from '../core/persistence/boardFile'
import batterySwitchResistorLed from './circuits/battery-switch-resistor-led.json'

/**
 * ゴールデンフィクスチャ: 目標回路「電池+スイッチ+抵抗+LED」。
 * これが壊れる = netlist / lint の契約が壊れた、と CI で検出する基準回路。
 * JSON をオブジェクトで import し、v1 スキーマ文字列として検証経路に通す
 * (将来の「サンプル回路を開く」UI と同じ経路)。
 */
const loadFixture = () =>
  deserializeBoard(JSON.stringify(batterySwitchResistorLed))

const byKind = (elements: readonly Element[], kind: string): Element => {
  const el = elements.find((e) => e.device.kind === kind)
  if (!el) throw new Error(`element not found: ${kind}`)
  return el
}

describe('fixture: battery-switch-resistor-led', () => {
  test('loads via the v1 schema into 8 placements', () => {
    expect(loadFixture().placements).toHaveLength(8)
  })

  test('builds the expected series loop (battery -> R -> LED -> switch -> battery)', () => {
    const { nets, elements, groundNode } = buildNetlist(loadFixture())

    expect(elements).toHaveLength(4)
    const battery = byKind(elements, 'battery')
    const resistor = byKind(elements, 'resistor')
    const led = byKind(elements, 'led')
    const sw = byKind(elements, 'switch')

    // plus レール: 電池 + と抵抗 a は上コーナー配線で同一ノード
    expect(resistor.pinNodes.a).toBe(battery.pinNodes.plus)
    // 抵抗 b と LED アノードが同一ノード
    expect(resistor.pinNodes.b).toBe(led.pinNodes.anode)
    // LED カソードと下側配線経由でスイッチ b が同一ノード
    expect(led.pinNodes.cathode).toBe(sw.pinNodes.b)
    // スイッチ a と電池 - が同一ノード = 基準ノード
    expect(sw.pinNodes.a).toBe(battery.pinNodes.minus)
    expect(groundNode).toBe(battery.pinNodes.minus)

    expect(nets).toHaveLength(4)
  })

  test('passes circuit lint with zero findings (switch open, fully wired)', () => {
    expect(lintCircuit(buildNetlist(loadFixture()))).toHaveLength(0)
  })

  test('closing the switch does not short the battery (R + LED in the path)', () => {
    const board = loadFixture()
    const switchId = board.placements.find((p) => p.partId === 'switch')!.blockId

    const closed = toggleSwitch(board, switchId)
    const findings = lintCircuit(buildNetlist(closed))

    expect(findings.map((f) => f.code)).not.toContain('battery-short')
    // 閉じても健全 (浮き・非電源もなし)
    expect(findings).toHaveLength(0)
  })
})
