import { describe, expect, test } from 'vitest'
import { buildNetlist } from '../core/netlist/build'
import { deserializeBoard } from '../core/persistence/boardFile'
import { createNgspiceSimulator } from '../io/ngspiceSimulator'
import { getSample } from './circuits/samples'
import { tranPlanFor } from '../core/simulation/spice/tranPlan'

/**
 * サンプル回路を実 ngspice-wasm で解いて解析解と突き合わせる統合テスト。
 * WASM を読むため遅い(数秒)ので、素振り用に分離。
 */
const simulate = (id: string) => {
  const sample = getSample(id)!
  const netlist = buildNetlist(deserializeBoard(JSON.stringify(sample.data)))
  return createNgspiceSimulator().simulate(netlist)
}

describe('sample circuits vs. analytic values (ngspice)', () => {
  test('01-分圧回路: midpoint ≈ 3V·10/11 = 2.73V', async () => {
    const result = await simulate('voltage-divider')
    const volts = Object.values(result.nodeVoltages ?? {})

    expect(Math.max(...volts)).toBeCloseTo(3, 2)
    expect(Math.min(...volts)).toBeCloseTo(0, 2)
    // 中点電圧が存在する
    expect(volts.some((v) => Math.abs(v - 2.727) < 0.01)).toBe(true)
  }, 60000)

  test('02-並列抵抗: source current ≈ 3.3mA', async () => {
    const result = await simulate('parallel-resistors')
    const maxCurrent = Math.max(
      ...Object.values(result.elementCurrents ?? {}).map(Math.abs),
    )
    expect(maxCurrent).toBeCloseTo(0.0033, 4)
  }, 60000)

  test('00-Lチカ: LED off (switch open by default)', async () => {
    const result = await simulate('led-blink')
    const maxCurrent = Math.max(
      ...Object.values(result.elementCurrents ?? {}).map(Math.abs),
    )
    expect(maxCurrent).toBeLessThan(1e-4) // 開スイッチ → ほぼ 0
  }, 60000)

  test('03-RC充放電: capacitor charges toward 3V, ~63% at τ=1s', async () => {
    const sample = getSample('rc-charge')!
    const netlist = buildNetlist(deserializeBoard(JSON.stringify(sample.data)))
    const result = await createNgspiceSimulator().simulate(netlist, {
      kind: 'tran',
      step: 0.02,
      stop: 5,
    })

    const wf = result.waveforms!
    expect(wf.time.length).toBeGreaterThan(10)
    // 充電するノード = 上昇幅 (終端 − 開始) が最大の系列 (定数の電源レールを避ける)
    const rise = (s: number[]): number => (s.at(-1) ?? 0) - (s[0] ?? 0)
    const series = Object.values(wf.nodeVoltages).reduce((a, b) =>
      rise(b) > rise(a) ? b : a,
    )
    // 開始 ≈ 0V、終端 ≈ 3V
    expect(series[0]).toBeLessThan(0.3)
    expect(series.at(-1)).toBeCloseTo(3, 1)
    // t≈1s(τ)で ≈63.2% = 1.9V 付近
    const iTau = wf.time.findIndex((t) => t >= 1.0)
    expect(series[iTau]).toBeGreaterThan(1.6)
    expect(series[iTau]).toBeLessThan(2.2)
  }, 60000)

  // 04-マルチバイブレータの「発振」は vite-node では確実に再現するが
  // (`tools/` の検証や scratch で 11 crossings/3s を確認)、vitest 環境では
  // eecircuit-engine の過渡が起動しないことがある (対称マルチの既知メタ安定 +
  // 環境依存)。ここでは「エラーなく過渡波形を生成する」ことだけを堅牢に確認し、
  // 発振トポロジ(クロス結合)は samples.test.ts の決定論的な構造テストで守る。
  test('04-点滅マルチバイブレータ: runs a transient without error', async () => {
    const sample = getSample('astable-multivibrator')!
    const netlist = buildNetlist(deserializeBoard(JSON.stringify(sample.data)))
    const result = await createNgspiceSimulator().simulate(netlist, {
      kind: 'tran',
      step: 0.005,
      stop: 3,
    })

    expect(result.status).toBe('ok')
    expect(result.waveforms?.time.length ?? 0).toBeGreaterThan(100)
  }, 60000)

  /**
   * 06/07 は信号源つきなので tranPlanFor が「1kHz の 5 周期 / 200点」の窓と
   * 動作点起動を選ぶ。ここでは解析解と突合する:
   *   06: Av = -Rc/(Re+re)、re = 26mV/Ic ≈ 116Ω → 約 22 倍で反転
   *   07: Av ≈ Re/(Re+re) ≈ 1、Vb - Ve ≈ 0.7V
   */
  const runTran = async (id: string) => {
    const sample = getSample(id)!
    const netlist = buildNetlist(deserializeBoard(JSON.stringify(sample.data)))
    const plan = tranPlanFor(netlist)
    const result = await createNgspiceSimulator().simulate(netlist, {
      kind: 'tran',
      ...plan,
    })
    return { netlist, result }
  }

  /** 整定を避けて後半だけで振幅を測る */
  const peakToPeak = (series: readonly number[]): number => {
    const tail = series.slice(Math.floor(series.length / 2))
    return Math.max(...tail) - Math.min(...tail)
  }

  test('06-1石アンプ: 約 22 倍で反転増幅 (Av = -Rc/(Re+re))', async () => {
    const { netlist, result } = await runTran('common-emitter-amp')
    const wf = result.waveforms!
    const q = netlist.elements.find((e) => e.device.kind === 'transistor-npn')!
    const src = netlist.elements.find((e) => e.device.kind === 'ac-source')!

    const vin = wf.nodeVoltages[src.pinNodes.plus]
    const vout = wf.nodeVoltages[q.pinNodes.collector]
    // 入力 20mVpp → 出力は 15〜30 倍 (解析解 21.8)
    const gain = peakToPeak(vout) / peakToPeak(vin)
    expect(gain).toBeGreaterThan(15)
    expect(gain).toBeLessThan(30)
    // レールでクリップしていない (3V 電源で振幅 0.5V 弱)
    expect(Math.max(...vout)).toBeLessThan(3)
    expect(Math.min(...vout)).toBeGreaterThan(0.5)

    // 位相反転: 入力が最大の瞬間、出力は平均より低い
    const tail = (s: readonly number[]) => s.slice(Math.floor(s.length / 2))
    const inTail = tail(vin)
    const outTail = tail(vout)
    const iPeak = inTail.indexOf(Math.max(...inTail))
    const outAvg = outTail.reduce((a, b) => a + b, 0) / outTail.length
    expect(outTail[iPeak]).toBeLessThan(outAvg)
  }, 60000)

  test('07-エミッタフォロワ: 利得 ≈ 1、出力はベースより約 0.7V 低い', async () => {
    const { netlist, result } = await runTran('emitter-follower')
    const wf = result.waveforms!
    const q = netlist.elements.find((e) => e.device.kind === 'transistor-npn')!
    const src = netlist.elements.find((e) => e.device.kind === 'ac-source')!

    const gain =
      peakToPeak(wf.nodeVoltages[q.pinNodes.emitter]) /
      peakToPeak(wf.nodeVoltages[src.pinNodes.plus])
    expect(gain).toBeGreaterThan(0.9)
    expect(gain).toBeLessThanOrEqual(1.0)

    // Vbe: ベースとエミッタの差はどの時刻でも 0.6〜0.8V
    const vb = wf.nodeVoltages[q.pinNodes.base]
    const ve = wf.nodeVoltages[q.pinNodes.emitter]
    const diffs = vb.map((v, i) => v - ve[i]).slice(Math.floor(vb.length / 2))
    expect(Math.min(...diffs)).toBeGreaterThan(0.6)
    expect(Math.max(...diffs)).toBeLessThan(0.8)
  }, 60000)

  /**
   * 08 は DC 解が 2 つある回路。serialize が uic-kick 系に付ける `.nodeset`
   * (= 最初の NPN を ON 側に寄せる推定) で片側にラッチするのを確認し、
   * ベースを GND へ落とすスイッチで反転することを見る。
   */
  const flipflop = () =>
    buildNetlist(deserializeBoard(JSON.stringify(getSample('bistable-flipflop')!.data)))

  /** 2 石のコレクタ電圧と LED 電流を .op で読む */
  const latchState = async (netlist: ReturnType<typeof flipflop>) => {
    const result = await createNgspiceSimulator().simulate(netlist)
    const v = result.nodeVoltages ?? {}
    const npns = netlist.elements.filter((e) => e.device.kind === 'transistor-npn')
    const leds = netlist.elements.filter((e) => e.device.kind === 'led')
    return {
      collectors: npns.map((q) => v[q.pinNodes.collector]),
      ledCurrents: leds.map((l) => Math.abs((result.elementCurrents ?? {})[l.blockId] ?? 0)),
    }
  }

  test('08-フリップフロップ: 片方 ON・片方 OFF でラッチし LED が片側だけ点く', async () => {
    const { collectors, ledCurrents } = await latchState(flipflop())

    // 一方は飽和 (0.3V 未満)、他方はそれより 1V 以上高い
    const [low, high] = [...collectors].sort((a, b) => a! - b!)
    expect(low!).toBeLessThan(0.3)
    expect(high! - low!).toBeGreaterThan(1)

    // LED 電流は 10 倍以上違う (点灯 / 消灯)
    const [dark, lit] = [...ledCurrents].sort((a, b) => a - b)
    expect(lit).toBeGreaterThan(5e-4)
    expect(lit / Math.max(dark, 1e-12)).toBeGreaterThan(10)
  }, 60000)

  test('08-フリップフロップ: ベースを GND へ落とすと状態が反転する', async () => {
    const netlist = flipflop()
    const npns = netlist.elements.filter((e) => e.device.kind === 'transistor-npn')
    const before = await latchState(netlist)
    // ラッチで ON 側 (コレクタが低い) の石のベースを落とす
    const onIndex = before.collectors[0]! < before.collectors[1]! ? 0 : 1
    const onBase = npns[onIndex].pinNodes.base
    const sw = netlist.elements.find(
      (e) =>
        e.device.kind === 'switch' && Object.values(e.pinNodes).includes(onBase),
    )!
    const closed = {
      ...netlist,
      elements: netlist.elements.map((e) =>
        e.blockId === sw.blockId ? { ...e, state: { closed: true } } : e,
      ),
    }

    const after = await latchState(closed)
    // ON だった側が OFF になり、もう一方が ON になる
    expect(after.collectors[onIndex]!).toBeGreaterThan(before.collectors[onIndex]! + 1)
    expect(after.collectors[1 - onIndex]!).toBeLessThan(0.3)
  }, 60000)

  test('09-遅延点灯タイマー: トリガから約 30ms 遅れて点灯し、離すと消える', async () => {
    const netlist = buildNetlist(
      deserializeBoard(JSON.stringify(getSample('delay-timer')!.data)),
    )
    const plan = tranPlanFor(netlist)
    // パルス源から窓が決まる: 20ms + 200ms×1.5 = 320ms
    expect(plan.stop).toBeCloseTo(0.32, 6)

    const result = await createNgspiceSimulator().simulate(netlist, {
      kind: 'tran',
      ...plan,
    })
    const wf = result.waveforms!
    const q = netlist.elements.find((e) => e.device.kind === 'transistor-npn')!
    const src = netlist.elements.find((e) => e.device.kind === 'ac-source')!
    const vb = wf.nodeVoltages[q.pinNodes.base]
    const vc = wf.nodeVoltages[q.pinNodes.collector]
    const vtrig = wf.nodeVoltages[src.pinNodes.plus]
    const at = (i: number) => wf.time[i]

    // トリガは 20ms で立ち上がる
    const tTrig = at(vtrig.findIndex((v) => v > 1.5))
    expect(tTrig).toBeGreaterThan(0.018)
    expect(tTrig).toBeLessThan(0.025)

    // 点灯 (コレクタ飽和) はその 20〜50ms 後 (解析解 R·C·ln(3/2.3) ≈ 27ms)
    const iLit = vc.findIndex((v) => v < 0.5)
    expect(iLit, 'LED should light within the window').toBeGreaterThan(0)
    const delay = at(iLit) - tTrig
    expect(delay).toBeGreaterThan(0.02)
    expect(delay).toBeLessThan(0.05)

    // ベースは Vbe でクランプ (充電が止まる)
    expect(Math.max(...vb)).toBeGreaterThan(0.7)
    expect(Math.max(...vb)).toBeLessThan(0.85)

    // トリガを離した後は消える (コレクタが戻る)
    expect(vc.at(-1)!).toBeGreaterThan(1.5)
  }, 60000)
})
