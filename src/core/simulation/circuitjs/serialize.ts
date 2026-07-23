import type { Element, Netlist } from '../../netlist/build'

/**
 * Netlist → CircuitJS1 テキスト形式の変換器 (純関数)。
 *
 * CircuitJS1 は「同じピクセル座標に端点がある素子どうしは同一ノード」という
 * モデルなので、各ノード (union 根の edge key) を一意な座標へ写像すれば、
 * 配線ブロックは明示せずともノード同一性として表現できる。よって出力は
 * 素子 (v/r/162/s) + 接地 (g) だけで、ワイヤ行は出さない。
 *
 * 形式の出典 (pfalstad/circuitjs1 の各 Elm.dump):
 *   基底   : `<type> x1 y1 x2 y2 flags`
 *   v(電源): + ` waveform freq maxVoltage bias phase duty`   (DC は waveform=0)
 *   r(抵抗): + ` resistance`
 *   s(SW) : + ` position momentary`                          (0=閉 / 1=開)
 *   162(LED): + ` model cr cg cb maxBrightnessCurrent`       (flags に FLAG_MODEL)
 *   g(GND): 基底のみ
 * ※ LED の model 文字列と `$` ヘッダのパラメータは版依存。ホストするビルドの
 *    エクスポート出力と突き合わせて確定する (テストは構造で固定している)。
 */

/** 1 セル = 32px (中点が 16px グリッドに乗る)。座標は接続性のみ担保できればよい */
const CELL_PX = 32
const HALF = CELL_PX / 2

/** LED の diode モデル (要ホストビルド確認)。default でも点灯確認はできる */
const LED_MODEL = 'default'
/** DiodeElm.FLAG_MODEL (model 文字列を dump する版のフラグ) */
const FLAG_MODEL = 8

interface Point {
  readonly x: number
  readonly y: number
}

/** ノード ID (edge key) を一意なピクセル座標へ。H/V で x/y のパリティが分かれ衝突しない */
const nodePoint = (nodeId: string): Point => {
  const m = /^([HV]):(-?\d+),(-?\d+)$/.exec(nodeId)
  if (!m) throw new Error(`ノードを座標に変換できません: ${nodeId}`)
  const [, kind, rowStr, colStr] = m
  const row = Number(rowStr)
  const col = Number(colStr)
  return kind === 'H'
    ? { x: col * CELL_PX + HALF, y: row * CELL_PX }
    : { x: col * CELL_PX, y: row * CELL_PX + HALF }
}

const elmLine = (
  type: string,
  a: Point,
  b: Point,
  flags: number,
  rest: readonly (string | number)[],
): string => [type, a.x, a.y, b.x, b.y, flags, ...rest].join(' ')

/** 1 素子を CircuitJS1 の 1 行に変換する */
const elementLine = (e: Element): string => {
  const d = e.device
  const at = (role: string): Point => nodePoint(e.pinNodes[role])
  switch (d.kind) {
    case 'battery':
      // point1=マイナス, point2=プラス。DC: waveform=0
      return elmLine('v', at('minus'), at('plus'), 0, [0, 40, d.volts, 0, 0, 0.5])
    case 'resistor':
      return elmLine('r', at('a'), at('b'), 0, [d.ohms])
    case 'switch':
      return elmLine('s', at('a'), at('b'), 0, [
        e.state?.closed ? 0 : 1,
        'false',
      ])
    case 'led':
      return elmLine('162', at('anode'), at('cathode'), FLAG_MODEL, [
        LED_MODEL,
        1,
        0,
        0,
        0.02,
      ])
    case 'diode':
      return elmLine('d', at('anode'), at('cathode'), FLAG_MODEL, [LED_MODEL])
    case 'capacitor':
      return elmLine('c', at('a'), at('b'), 0, [d.farads, 0, 0])
    case 'transistor-npn':
      // 目標回路には不要。到達したら未対応として明示する
      throw new Error('transistor は CircuitJS 変換に未対応です')
  }
}

/** 標準的なシミュレーションヘッダ (flags timeStep ...)。パラメータは版に寛容 */
const HEADER = '$ 1 0.000005 10.20027730826997 50 5 50'

/**
 * Netlist を CircuitJS1 のインポート用テキストへ変換する。
 * groundNode が無い回路は変換しない (lint gating 済みだが境界で防御)。
 */
export const toCircuitJs = (netlist: Netlist): string => {
  if (netlist.groundNode === null) {
    throw new Error('基準ノード (GND) が無いため変換できません')
  }
  const groundAt = nodePoint(netlist.groundNode)
  const lines = [
    HEADER,
    ...netlist.elements.map(elementLine),
    // 接地: point1 を GND ノードに、point2 は記号の足 (少し下)
    elmLine('g', groundAt, { x: groundAt.x, y: groundAt.y + HALF }, 0, []),
  ]
  return lines.join('\n')
}
