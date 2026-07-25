import type { ReactElement } from 'react'
import { unitOf } from '../../core/scope/traceExpr'
import type { Waveforms } from '../../core/simulation/spice/mapResult'
import { measureSeries } from '../../core/simulation/spice/measure'
import { intervalStats } from './cursorReadout'
import { fmtI, fmtV, fmtW } from './format'
import type { DrawTrace } from './traceSeries'

/** 周波数を Hz / kHz で。発振無しは — */
const fmtFreq = (f: number | null): string =>
  f == null ? '—' : f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(2)} Hz`

const fmtDuty = (d: number | null): string =>
  d == null ? '—' : `${(d * 100).toFixed(0)} %`

/** 単位に合わせた値の書式 (V / mA / mW / 無次元) */
const formatter = (trace: DrawTrace): ((v: number) => string) => {
  switch (unitOf(trace.expr)) {
    case 'A':
      return fmtI
    case 'W':
      return fmtW
    case 'V':
      return fmtV
    default:
      return (v) => v.toPrecision(3)
  }
}

/**
 * 表示中の全トレースの自動測定値 (LTspice の `.meas` 相当をまとめて出す表)。
 * pp / 平均 / RMS / 周波数 / Duty を、記録全体ではなく**表示中の窓**で測る
 * (ズームすればその区間の値になる)。
 */
export const MeasurementTable = ({
  waveforms,
  traces,
  win,
}: {
  waveforms: Waveforms
  traces: readonly DrawTrace[]
  win: { start: number; end: number }
}): ReactElement | null => {
  if (traces.length === 0) return null
  return (
    <table className="measure-table">
      <thead>
        <tr>
          <th></th>
          <th>pp</th>
          <th>平均</th>
          <th>RMS</th>
          <th>周波数</th>
          <th>Duty</th>
        </tr>
      </thead>
      <tbody>
        {traces.map((t) => {
          const m = measureSeries(waveforms.time, t.values)
          const stats = intervalStats(waveforms.time, t.values, win.start, win.end)
          const fmt = formatter(t)
          return (
            <tr key={t.key}>
              <th scope="row">
                <span className="wave-swatch" style={{ background: t.color }} />
                {t.label}
              </th>
              <td>{fmt(m.vpp)}</td>
              <td>{fmt(stats.avg)}</td>
              <td>{fmt(stats.rms)}</td>
              <td>{fmtFreq(m.freq)}</td>
              <td>{fmtDuty(m.duty)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
