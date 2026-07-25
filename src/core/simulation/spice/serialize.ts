import type { Element, Netlist } from '../../netlist/build'

/**
 * Netlist → SPICE netlist の変換器 (純関数)。唯一のエンジンである
 * ngspice へ渡す。解析は動作点 `.op` と過渡 `.tran` ({@link TranStartup} で起動条件を選ぶ)。
 *
 * 方針(実物 ngspice-wasm で素振りして確定):
 * - 基準ノード(groundNode)= SPICE の `0`、他は `n1, n2, …`
 * - 電池 → `V<k> + - DC <volts>`。ループ電流は `i(v<k>)` で取れる
 * - 抵抗 → `R<k> a b <ohms>`
 * - LED/ダイオード → `D<k> anode <mid> <model>` + 直列 0V 電源 `Vm<k> <mid> cathode DC 0`
 *   (0V 電源=電流計。`i(vm<k>)` で素子電流を直接測る)
 * - スイッチ → 抵抗置換。閉=1mΩ / 開=1GΩ(省略すると浮きノードで特異行列になる)
 * - コンデンサ → `C<k> a b <farads>`(.op では開放。点灯判定には影響しない)
 */

/** 赤 LED の簡易ダイオードモデル (Vf≈1.9V @ 1mA)。素振りで確認 */
const LED_MODEL = 'ELED'
const DIODE_MODEL = 'EDIODE'
const NPN_MODEL = 'ENPN'
const MODEL_LINES = {
  led: `.model ${LED_MODEL} D(IS=1.4e-19 N=2)`,
  diode: `.model ${DIODE_MODEL} D(IS=1e-12 N=1)`,
  npn: `.model ${NPN_MODEL} NPN(BF=100)`,
}

const SWITCH_CLOSED_OHMS = '0.001'
const SWITCH_OPEN_OHMS = '1e9'

/**
 * 過渡の起動条件。回路ごとに要求が違うので呼び出し側が選ぶ。
 * - `operating-point`: DC 動作点を初期値にする (`.tran` 素のまま)。増幅器はこれ。
 *   バイアス点から始まるので利得・位相をそのまま測れる
 * - `zero-state`: `uic` でコンデンサを 0 から充電する。RC 充放電の観測用
 * - `uic-kick`: `zero-state` ＋ 最初の NPN を ON 側に固定する `.ic`。対称な
 *   マルチバイブレータ／双安定はメタ安定で起動しないため、状態を決めて発振させる
 */
export type TranStartup = 'operating-point' | 'zero-state' | 'uic-kick'

/** 解析カード。動作点 (.op) か過渡 (.tran) */
export type Analysis =
  | { readonly kind: 'op' }
  | {
      readonly kind: 'tran'
      readonly step: number
      readonly stop: number
      /** 省略時は互換動作 ({@link legacyStartup}) */
      readonly startup?: TranStartup
    }

/**
 * `startup` 省略時の起動条件。NPN があればキック付き、無ければ初期値 0 という
 * 従来の暗黙ルールをそのまま残したもの。各サンプルが起動条件を明示するように
 * なれば不要になる (docs/08 Ph1-e)。
 */
const legacyStartup = (netlist: Netlist): TranStartup =>
  netlist.elements.some((e) => e.device.kind === 'transistor-npn')
    ? 'uic-kick'
    : 'zero-state'

/** 変換結果。結果ベクトル名をうちの nodeId / blockId へ戻すための対応表つき */
export interface SpiceNetlist {
  readonly text: string
  /** nodeId → SPICE ノード名 (基準は '0') */
  readonly nodeNames: Readonly<Record<string, string>>
  /** blockId → 素子電流を読む SPICE 変数名 (ngspice 表記の小文字, 例 'i(v1)') */
  readonly currentProbes: Readonly<Record<string, string>>
  /**
   * blockId → 値変更できる素子の SPICE 参照名 (小文字, 例 'r1'/'c1'/'v1')。
   * ライブストリームの `alter <ref> = <value>` 宛先。R/C/V(スイッチ含む)のみ。
   */
  readonly deviceRefs: Readonly<Record<string, string>>
}

/**
 * Netlist を SPICE netlist へ変換する。
 * groundNode が無い回路は変換しない (lint gating 済みだが境界で防御)。
 */
export const toSpice = (
  netlist: Netlist,
  analysis: Analysis = { kind: 'op' },
): SpiceNetlist => {
  if (netlist.groundNode === null) {
    throw new Error('基準ノード (GND) が無いため変換できません')
  }

  // ノード採番: 基準 = '0'、他は出現順に n1, n2, …
  const nodeNames: Record<string, string> = { [netlist.groundNode]: '0' }
  let nodeSeq = 0
  const nodeName = (nodeId: string): string => {
    const existing = nodeNames[nodeId]
    if (existing !== undefined) return existing
    const name = `n${++nodeSeq}`
    nodeNames[nodeId] = name
    return name
  }

  const lines: string[] = ['e-block-nano circuit']
  const currentProbes: Record<string, string> = {}
  const deviceRefs: Record<string, string> = {}
  const seq = { V: 0, R: 0, D: 0, C: 0, Q: 0 }

  for (const e of netlist.elements) {
    emitElement(e, lines, currentProbes, deviceRefs, seq, nodeName)
  }

  // 使われている素子種に応じてモデルを付ける
  const kinds = new Set(netlist.elements.map((e) => e.device.kind))
  if (kinds.has('led')) lines.push(MODEL_LINES.led)
  if (kinds.has('diode')) lines.push(MODEL_LINES.diode)
  if (kinds.has('transistor-npn')) lines.push(MODEL_LINES.npn)

  if (analysis.kind === 'op') {
    lines.push('.op')
  } else {
    const startup = analysis.startup ?? legacyStartup(netlist)
    if (startup === 'uic-kick') {
      // 最初のトランジスタを明確に ON (ベース高・コレクタ低) に固定した初期条件から
      // 始めて確実に発振させる。
      const npn = netlist.elements.find((e) => e.device.kind === 'transistor-npn')
      if (npn) {
        lines.push(
          `.ic v(${nodeNames[npn.pinNodes.base]})=0.7 v(${nodeNames[npn.pinNodes.collector]})=0.1`,
        )
      }
    }
    // uic = DC 動作点を求めず初期値から始める
    const uic = startup === 'operating-point' ? '' : ' uic'
    lines.push(`.tran ${analysis.step} ${analysis.stop}${uic}`)
  }
  lines.push('.end')
  return { text: lines.join('\n'), nodeNames, currentProbes, deviceRefs }
}

type Seq = { V: number; R: number; D: number; C: number; Q: number }

/** 1 素子を SPICE 行に足し、電流プローブ・alter 用デバイス参照を登録する */
const emitElement = (
  e: Element,
  lines: string[],
  probes: Record<string, string>,
  deviceRefs: Record<string, string>,
  seq: Seq,
  nodeName: (id: string) => string,
): void => {
  const d = e.device
  const node = (role: string): string => nodeName(e.pinNodes[role])
  switch (d.kind) {
    case 'battery': {
      const ref = `V${++seq.V}`
      lines.push(`${ref} ${node('plus')} ${node('minus')} DC ${d.volts}`)
      probes[e.blockId] = `i(${ref.toLowerCase()})`
      deviceRefs[e.blockId] = ref.toLowerCase()
      return
    }
    case 'resistor': {
      const ref = `R${++seq.R}`
      lines.push(`${ref} ${node('a')} ${node('b')} ${d.ohms}`)
      deviceRefs[e.blockId] = ref.toLowerCase()
      probes[e.blockId] = `@${ref.toLowerCase()}[i]` // 素子内部電流(.save で出す)
      return
    }
    case 'switch': {
      const ref = `R${++seq.R}`
      const ohms = e.state?.closed ? SWITCH_CLOSED_OHMS : SWITCH_OPEN_OHMS
      lines.push(`${ref} ${node('a')} ${node('b')} ${ohms}`)
      deviceRefs[e.blockId] = ref.toLowerCase()
      probes[e.blockId] = `@${ref.toLowerCase()}[i]`
      return
    }
    case 'capacitor': {
      const ref = `C${++seq.C}`
      lines.push(`${ref} ${node('a')} ${node('b')} ${d.farads}`)
      deviceRefs[e.blockId] = ref.toLowerCase()
      probes[e.blockId] = `@${ref.toLowerCase()}[i]`
      return
    }
    case 'led':
    case 'diode': {
      // 直列 0V 電源で素子電流を計測する (anode → mid → cathode)
      const dk = ++seq.D
      const mid = `d${dk}mid`
      const model = d.kind === 'led' ? LED_MODEL : DIODE_MODEL
      const meter = `VmD${dk}`
      lines.push(`D${dk} ${node('anode')} ${mid} ${model}`)
      lines.push(`${meter} ${mid} ${node('cathode')} DC 0`)
      probes[e.blockId] = `i(${meter.toLowerCase()})`
      return
    }
    case 'transistor-npn': {
      // Q<k> collector base emitter <model>
      lines.push(
        `Q${++seq.Q} ${node('collector')} ${node('base')} ${node('emitter')} ${NPN_MODEL}`,
      )
      return
    }
  }
}
