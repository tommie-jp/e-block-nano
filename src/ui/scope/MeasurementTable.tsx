import type { ReactElement } from 'react'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { measureSeries } from '../../core/simulation/spice/measure'
import type { NodeProbe } from '../waveProbes'

/** 電圧を V / mV で見やすく */
const fmtV = (v: number): string =>
  Math.abs(v) >= 1 ? `${v.toFixed(2)} V` : `${(v * 1000).toFixed(0)} mV`

/** 周波数を Hz / kHz で。発振無しは — */
const fmtFreq = (f: number | null): string =>
  f == null ? '—' : f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(2)} Hz`

const fmtDuty = (d: number | null): string =>
  d == null ? '—' : `${(d * 100).toFixed(0)} %`

/**
 * 表示中の各チャンネルの自動測定値をコンパクトな表にする。
 * 測定はフル記録 (窓ではなく全区間) で行う (周波数は周期が多いほど安定)。
 */
export const MeasurementTable = ({
  waveforms,
  probes,
}: {
  waveforms: Waveforms
  probes: NodeProbe[]
}): ReactElement | null => {
  if (probes.length === 0) return null
  return (
    <table className="measure-table">
      <thead>
        <tr>
          <th></th>
          <th>Vpp</th>
          <th>Vavg</th>
          <th>周波数</th>
          <th>Duty</th>
        </tr>
      </thead>
      <tbody>
        {probes.map((p) => {
          const m = measureSeries(waveforms.time, waveforms.nodeVoltages[p.nodeId])
          return (
            <tr key={p.nodeId}>
              <th scope="row">
                <span className="wave-swatch" style={{ background: p.color }} />
                {p.label}
              </th>
              <td>{fmtV(m.vpp)}</td>
              <td>{fmtV(m.vavg)}</td>
              <td>{fmtFreq(m.freq)}</td>
              <td>{fmtDuty(m.duty)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
