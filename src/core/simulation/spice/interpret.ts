import type { Netlist } from '../../netlist/build'

/** これ以上の電流(絶対値)で LED を点灯とみなす [A] */
export const LED_LIT_THRESHOLD_A = 1e-4

export const isLit = (current: number | undefined): boolean =>
  Math.abs(current ?? 0) >= LED_LIT_THRESHOLD_A

/**
 * 計算結果を人間向けサマリにする。
 * LED があれば点灯/消灯 + 電流、無ければノード電圧 + 電源電流 (分圧・並列用)。
 */
export const describeResult = (
  netlist: Netlist,
  elementCurrents: Readonly<Record<string, number>>,
  nodeVoltages: Readonly<Record<string, number>> = {},
): string => {
  const leds = netlist.elements.filter((e) => e.device.kind === 'led')
  if (leds.length > 0) {
    return leds
      .map((led) => {
        const mA = Math.abs(elementCurrents[led.blockId] ?? 0) * 1000
        const state = isLit(elementCurrents[led.blockId]) ? '点灯' : '消灯'
        return `LED ${state} (${mA.toFixed(2)}mA)`
      })
      .join(' / ')
  }

  // LED なし: ノード電圧 (重複除去・降順) と電源電流
  const volts = [...new Set(Object.values(nodeVoltages).map((v) => v.toFixed(2)))]
    .map(Number)
    .sort((a, b) => b - a)
  const vStr =
    volts.length > 0 ? `ノード電圧 ${volts.map((v) => v.toFixed(2)).join(' / ')}V` : ''
  const battery = netlist.elements.find((e) => e.device.kind === 'battery')
  const iStr = battery
    ? ` / 電源電流 ${(Math.abs(elementCurrents[battery.blockId] ?? 0) * 1000).toFixed(2)}mA`
    : ''
  return (vStr + iStr).trim() || 'ノード電圧を計算しました'
}
