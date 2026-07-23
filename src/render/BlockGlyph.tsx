import type { ReactElement } from 'react'
import type { Orientation } from '../core/grid/types'
import type { Direction, DeviceSpec, Part } from '../core/parts/types'
import { devicePins } from '../core/parts/types'
import { isLit } from '../core/simulation/spice/interpret'
import { CELL_SIZE } from './constants'

const C = CELL_SIZE / 2 // 中心座標
const EDGE_INSET = 7 // ブロック外形のセル縁からの引き込み
const STUB_LEN = 12 // 端子スタブの長さ

/** 辺中央 (接点) のローカル座標 */
const EDGE_POINT: Record<Direction, { x: number; y: number }> = {
  N: { x: C, y: 0 },
  E: { x: CELL_SIZE, y: C },
  S: { x: C, y: CELL_SIZE },
  W: { x: 0, y: C },
}

/** 端子スタブ: 辺中央から内側へ向かう線 */
const stubEnd: Record<Direction, { x: number; y: number }> = {
  N: { x: C, y: STUB_LEN },
  E: { x: CELL_SIZE - STUB_LEN, y: C },
  S: { x: C, y: CELL_SIZE - STUB_LEN },
  W: { x: STUB_LEN, y: C },
}

const Stub = ({ dir }: { dir: Direction }): ReactElement => {
  const from = EDGE_POINT[dir]
  const to = stubEnd[dir]
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      className="glyph-line"
    />
  )
}

/** 配線ブロック: 端子グループを中心経由で結ぶ */
const WireSymbol = ({ part }: { part: Part }): ReactElement => (
  <g>
    {part.internalNets.flatMap((group) =>
      group.map((dir) => {
        const p = EDGE_POINT[dir]
        return (
          <line
            key={dir}
            x1={p.x}
            y1={p.y}
            x2={C}
            y2={C}
            className="glyph-line"
          />
        )
      }),
    )}
  </g>
)

/** N-S 2 端子部品の記号 (向き 0 で縦方向) */
const TwoTerminalSymbol = ({
  device,
  closed,
  current,
}: {
  device: DeviceSpec
  closed: boolean
  current?: number
}): ReactElement => {
  const ledLit = device.kind === 'led' && isLit(current)
  const body = (() => {
    switch (device.kind) {
      case 'resistor':
        return (
          <polyline
            className="glyph-line"
            fill="none"
            points={`${C},${STUB_LEN} ${C + 7},${STUB_LEN + 5} ${C - 7},${STUB_LEN + 13} ${C + 7},${STUB_LEN + 21} ${C - 7},${STUB_LEN + 29} ${C + 7},${STUB_LEN + 37} ${C},${CELL_SIZE - STUB_LEN}`}
          />
        )
      case 'capacitor':
        return (
          <g className="glyph-line">
            <line x1={C} y1={STUB_LEN} x2={C} y2={C - 4} />
            <line x1={C - 10} y1={C - 4} x2={C + 10} y2={C - 4} />
            <line x1={C - 10} y1={C + 4} x2={C + 10} y2={C + 4} />
            <line x1={C} y1={C + 4} x2={C} y2={CELL_SIZE - STUB_LEN} />
          </g>
        )
      case 'led':
      case 'diode':
        return (
          <g className="glyph-line">
            <line x1={C} y1={STUB_LEN} x2={C} y2={C - 8} />
            {ledLit && (
              <circle cx={C} cy={C} r={16} fill="#ff4d4d" opacity={0.5} />
            )}
            <polygon
              points={`${C - 9},${C - 8} ${C + 9},${C - 8} ${C},${C + 8}`}
              fill={
                device.kind !== 'led'
                  ? 'none'
                  : ledLit
                    ? '#ff3b3b'
                    : 'var(--led-fill)'
              }
            />
            <line x1={C - 9} y1={C + 8} x2={C + 9} y2={C + 8} />
            <line x1={C} y1={C + 8} x2={C} y2={CELL_SIZE - STUB_LEN} />
            {device.kind === 'led' && (
              <g>
                <line x1={C + 10} y1={C - 12} x2={C + 16} y2={C - 18} />
                <line x1={C + 14} y1={C - 6} x2={C + 20} y2={C - 12} />
              </g>
            )}
          </g>
        )
      case 'switch':
        return (
          <g className="glyph-line">
            <line x1={C} y1={STUB_LEN} x2={C} y2={C - 10} />
            {/* 閉=接点を結ぶ縦線 / 開=斜めに離れたレバー */}
            {closed ? (
              <line x1={C} y1={C - 10} x2={C} y2={C + 10} />
            ) : (
              <line x1={C} y1={C - 10} x2={C + 12} y2={C + 8} />
            )}
            <line x1={C} y1={C + 10} x2={C} y2={CELL_SIZE - STUB_LEN} />
            <circle cx={C} cy={C - 10} r={2} fill="currentColor" />
            <circle cx={C} cy={C + 10} r={2} fill="currentColor" />
          </g>
        )
      case 'battery':
        return (
          <g className="glyph-line">
            <line x1={C} y1={STUB_LEN} x2={C} y2={C - 4} />
            <line x1={C - 12} y1={C - 4} x2={C + 12} y2={C - 4} />
            <line x1={C - 5} y1={C + 4} x2={C + 5} y2={C + 4} strokeWidth={3} />
            <line x1={C} y1={C + 4} x2={C} y2={CELL_SIZE - STUB_LEN} />
          </g>
        )
      default:
        return <circle cx={C} cy={C} r={8} className="glyph-line" fill="none" />
    }
  })()
  return (
    <g>
      {devicePins(device).map(([role, dir]) => (
        <Stub key={role} dir={dir} />
      ))}
      {body}
    </g>
  )
}

/** トランジスタ (N=コレクタ, E=ベース, S=エミッタ) */
const TransistorSymbol = (): ReactElement => (
  <g className="glyph-line">
    <circle cx={C} cy={C} r={13} fill="none" />
    <line x1={C - 6} y1={C - 8} x2={C - 6} y2={C + 8} />
    <line x1={CELL_SIZE} y1={C} x2={C - 6} y2={C} />
    <line x1={C} y1={0} x2={C} y2={C - 12} />
    <line x1={C} y1={C - 12} x2={C - 6} y2={C - 4} />
    <line x1={C - 6} y1={C + 4} x2={C} y2={C + 12} />
    <line x1={C} y1={C + 12} x2={C} y2={CELL_SIZE} />
    <polygon
      points={`${C - 2},${C + 6} ${C + 1},${C + 12} ${C - 5},${C + 11}`}
      fill="currentColor"
    />
  </g>
)

const symbolFor = (
  part: Part,
  closed: boolean,
  current?: number,
): ReactElement => {
  if (!part.device) return <WireSymbol part={part} />
  if (part.device.kind === 'transistor-npn') return <TransistorSymbol />
  return (
    <TwoTerminalSymbol device={part.device} closed={closed} current={current} />
  )
}

/** 部品につける短い値ラベル */
const LABELS: Record<string, string> = {
  'resistor-1k': '1kΩ',
  'resistor-10k': '10kΩ',
  'capacitor-100n': '0.1µ',
  'capacitor-100u': '100µ',
  'led-red': 'LED',
  'diode-schottky': 'BAT43',
  'transistor-npn': 'NPN',
  switch: 'SW',
  'battery-3v': '3V',
}

interface BlockGlyphProps {
  part: Part
  orientation: Orientation
  selected?: boolean
  /** スイッチが閉じているか (スイッチ以外は無視) */
  closed?: boolean
  /** 素子電流 [A] (LED の点灯表現に使う)。未計算なら undefined */
  current?: number
}

/**
 * ブロック 1 個の SVG 描画 (セルローカル座標 0..CELL_SIZE)。
 * 記号は向きに合わせて回転し、ラベルは水平のまま残す。
 */
export const BlockGlyph = ({
  part,
  orientation,
  selected = false,
  closed = false,
  current,
}: BlockGlyphProps): ReactElement => {
  const label = LABELS[part.id]
  return (
    <g>
      <rect
        x={EDGE_INSET}
        y={EDGE_INSET}
        width={CELL_SIZE - EDGE_INSET * 2}
        height={CELL_SIZE - EDGE_INSET * 2}
        rx={6}
        className={selected ? 'block-body selected' : 'block-body'}
      />
      <g transform={`rotate(${orientation}, ${C}, ${C})`}>
        {symbolFor(part, closed, current)}
      </g>
      {label && (
        <text x={C} y={CELL_SIZE - EDGE_INSET - 3} className="block-label">
          {label}
        </text>
      )}
    </g>
  )
}
