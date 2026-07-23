import type { Element, Netlist } from '../netlist/build'

export type LintCode =
  | 'no-battery'
  | 'battery-short'
  | 'floating-pin'
  | 'unpowered-element'

export type LintSeverity = 'error' | 'warning'

/** 1 件の検査結果。message はそのまま UI に出す日本語 */
export interface LintFinding {
  readonly code: LintCode
  readonly severity: LintSeverity
  readonly message: string
  /** 関係するブロック (将来 UI ハイライトに使う) */
  readonly blockIds: readonly string[]
}

/** 経路圧縮のみの Union-Find。ノード文字列を併合する */
const createUnionFind = () => {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x)
    if (p === undefined || p === x) {
      parent.set(x, x)
      return x
    }
    const root = find(p)
    parent.set(x, root)
    return root
  }
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b))
  }
  return { find, union }
}

const isBattery = (e: Element): boolean => e.device.kind === 'battery'

const isClosedSwitch = (e: Element): boolean =>
  e.device.kind === 'switch' && e.state?.closed === true

/** 素子の全ピンノードを併合する (直列でも 1 成分に繋げる) */
const bridgePins = (uf: ReturnType<typeof createUnionFind>, e: Element): void => {
  const nodes = Object.values(e.pinNodes)
  nodes.forEach((n, i) => {
    if (i > 0) uf.union(nodes[0], n)
  })
}

/**
 * 電池がなければ error。配線ネットは buildNetlist で既に同一 nodeId に
 * 併合済みなので、ここでは素子だけを見る。
 */
const checkNoBattery = (netlist: Netlist): LintFinding[] => {
  const hasBattery = netlist.elements.some(isBattery)
  if (netlist.elements.length === 0 || hasBattery) return []
  return [
    {
      code: 'no-battery',
      severity: 'error',
      message: '電池がありません。回路に電源を追加してください。',
      blockIds: [],
    },
  ]
}

/**
 * 導体 (配線 + 閉じたスイッチ) だけで電池の +/- が直結していれば短絡。
 * 配線は nodeId が既に同一なので、追加で閉スイッチのピンを併合して判定する。
 */
const checkBatteryShort = (netlist: Netlist): LintFinding[] => {
  const uf = createUnionFind()
  for (const e of netlist.elements) {
    if (isClosedSwitch(e)) bridgePins(uf, e)
  }
  return netlist.elements
    .filter(isBattery)
    .filter((b) => uf.find(b.pinNodes.plus) === uf.find(b.pinNodes.minus))
    .map((b) => ({
      code: 'battery-short' as const,
      severity: 'error' as const,
      message:
        '電池がショートしています。プラスとマイナスが導体（配線や閉じたスイッチ）だけで直結しています。',
      blockIds: [b.blockId],
    }))
}

/**
 * 電池の導通成分から到達できない素子 (離れ小島)。
 * 到達判定は「配線 + 全素子のピン橋渡し」で行う (直列抵抗も電源側とみなす)。
 * 電池が無いときは checkNoBattery に任せて何もしない。
 */
const checkUnpowered = (netlist: Netlist): { findings: LintFinding[]; islandBlockIds: Set<string> } => {
  const batteries = netlist.elements.filter(isBattery)
  const islandBlockIds = new Set<string>()
  if (batteries.length === 0) return { findings: [], islandBlockIds }

  const uf = createUnionFind()
  for (const e of netlist.elements) bridgePins(uf, e)

  const poweredRoots = new Set(batteries.map((b) => uf.find(b.pinNodes.plus)))
  const findings = netlist.elements
    .filter((e) => !isBattery(e))
    .filter(
      (e) => !Object.values(e.pinNodes).some((n) => poweredRoots.has(uf.find(n))),
    )
    .map((e) => {
      islandBlockIds.add(e.blockId)
      return {
        code: 'unpowered-element' as const,
        severity: 'warning' as const,
        message: '電源から切り離された部品があります。配線が電池まで繋がっていません。',
        blockIds: [e.blockId],
      }
    })
  return { findings, islandBlockIds }
}

/**
 * 端子 1 個だけのネット = どこにも繋がっていない端子。
 * 離れ小島の素子 (unpowered) として既に報告済みの端子は除く (二重報告を避ける)。
 */
const checkFloatingPins = (
  netlist: Netlist,
  islandBlockIds: Set<string>,
): LintFinding[] =>
  netlist.nets
    .filter((net) => net.terminals.length === 1)
    .filter((net) => !islandBlockIds.has(net.terminals[0].blockId))
    .map((net) => ({
      code: 'floating-pin' as const,
      severity: 'warning' as const,
      message: '接続されていない端子があります（浮いています）。',
      blockIds: [net.terminals[0].blockId],
    }))

/**
 * netlist を検査して回路の問題を人間の言葉で返す。
 * シミュレータ接続前の前処理 (error があれば simulate を呼ばない gating に使う)。
 */
export const lintCircuit = (netlist: Netlist): readonly LintFinding[] => {
  const { findings: unpowered, islandBlockIds } = checkUnpowered(netlist)
  return [
    ...checkNoBattery(netlist),
    ...checkBatteryShort(netlist),
    ...unpowered,
    ...checkFloatingPins(netlist, islandBlockIds),
  ]
}
