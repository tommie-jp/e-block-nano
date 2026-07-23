import type { Netlist } from '../../netlist/build'

/** これ以上の電流(絶対値)で LED を点灯とみなす [A] */
export const LED_LIT_THRESHOLD_A = 1e-4

export const isLit = (current: number | undefined): boolean =>
  Math.abs(current ?? 0) >= LED_LIT_THRESHOLD_A

/** LED の点灯状態を人間向けサマリにする (点灯/消灯 + 電流 mA) */
export const describeResult = (
  netlist: Netlist,
  elementCurrents: Readonly<Record<string, number>>,
): string => {
  const leds = netlist.elements.filter((e) => e.device.kind === 'led')
  if (leds.length === 0) return 'ノード電圧を計算しました'
  return leds
    .map((led) => {
      const mA = Math.abs(elementCurrents[led.blockId] ?? 0) * 1000
      const state = isLit(elementCurrents[led.blockId]) ? '点灯' : '消灯'
      return `LED ${state} (${mA.toFixed(2)}mA)`
    })
    .join(' / ')
}
