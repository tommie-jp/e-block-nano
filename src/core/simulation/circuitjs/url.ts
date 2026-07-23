import type { Netlist } from '../../netlist/build'
import { toCircuitJs } from './serialize'

/**
 * Netlist を CircuitJS1 の埋め込み URL に変換する (純関数)。
 * 回路テキストを `?cct=` クエリに載せる方式なので**クロスオリジンでも動く**
 * (自前ホストでも falstad.com でも同じ URL 形を使える)。
 *
 * @param baseUrl 例: "/circuitjs/circuitjs.html" (自前) や
 *   "https://www.falstad.com/circuit/circuitjs.html"
 */
export const circuitJsUrl = (netlist: Netlist, baseUrl: string): string => {
  const text = toCircuitJs(netlist)
  const params = new URLSearchParams({
    cct: text,
    running: 'true',
    hideSidebar: 'true',
    hideMenu: 'true',
    editable: 'false',
  })
  return `${baseUrl}?${params.toString()}`
}
