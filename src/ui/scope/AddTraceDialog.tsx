import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { parseExpr } from '../../core/scope/parseExpr'
import type { ExprSymbols } from '../../core/scope/parseExpr'
import type { TraceExpr } from '../../core/scope/traceExpr'

/**
 * 「トレース追加」ダイアログ (LTspice の Add Trace 相当)。
 * 打てる量を一覧から挿し込みつつ、`V(N1)*I(blk-4)` のような式を書ける。
 */

interface AddTraceDialogProps {
  /** 挿し込める量の候補 (クリックで入力欄に入る) */
  quantities: readonly string[]
  symbols: ExprSymbols
  onAdd: (expr: TraceExpr) => void
  onClose: () => void
}

export const AddTraceDialog = ({
  quantities,
  symbols,
  onAdd,
  onClose,
}: AddTraceDialogProps): ReactElement => {
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)

  const result = useMemo(
    () => (text.trim() ? parseExpr(text, symbols) : null),
    [text, symbols],
  )
  const error = result && 'error' in result ? result.error : null

  const submit = (): void => {
    setTouched(true)
    if (result && 'expr' in result) {
      onAdd(result.expr)
      setText('')
      onClose()
    }
  }

  return (
    <div className="add-trace">
      <div className="add-trace-row">
        <input
          className="add-trace-input"
          value={text}
          placeholder="例: V(N1)*I(blk-4)"
          aria-label="トレースの式"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        <button type="button" onClick={submit} disabled={!text.trim()}>
          追加
        </button>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
      <div className="add-trace-picks">
        {quantities.map((q) => (
          <button
            key={q}
            type="button"
            className="pane-trace"
            onClick={() => setText((t) => t + q)}
            title="クリックで式に挿し込む"
          >
            {q}
          </button>
        ))}
      </div>
      <div className="add-trace-hint">
        {touched && error ? (
          <span className="add-trace-error">{error}</span>
        ) : (
          '四則演算 / abs() / sqrt() / d()（時間微分）が使えます'
        )}
      </div>
    </div>
  )
}
