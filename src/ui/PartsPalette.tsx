import type { ReactElement } from 'react'
import { PARTS } from '../core/parts/catalog'
import { BlockGlyph } from '../render/BlockGlyph'
import { CELL_SIZE } from '../render/constants'

interface PartsPaletteProps {
  selectedPartId: string | null
  onSelect: (partId: string | null) => void
}

/** パーツパレット。選択してからボードのセルをクリックで配置 */
export const PartsPalette = ({
  selectedPartId,
  onSelect,
}: PartsPaletteProps): ReactElement => (
  <div className="palette">
    <h2>パーツ</h2>
    <div className="palette-grid">
      {PARTS.map((part) => (
        <button
          key={part.id}
          type="button"
          title={part.name}
          className={
            part.id === selectedPartId ? 'palette-item selected' : 'palette-item'
          }
          onClick={() => onSelect(part.id === selectedPartId ? null : part.id)}
        >
          <svg viewBox={`0 0 ${CELL_SIZE} ${CELL_SIZE}`}>
            <BlockGlyph part={part} orientation={0} />
          </svg>
          <span className="palette-name">{part.name}</span>
        </button>
      ))}
    </div>
  </div>
)
