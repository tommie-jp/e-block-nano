import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

interface HeaderMenuProps {
  /** メニューパネルの中身。close を呼ぶとメニューが閉じる。 */
  children: (close: () => void) => ReactNode
}

/**
 * ハンバーガーボタンで開閉するドロップダウンメニュー。
 * 外側クリック / Escape で閉じる。パネルの中身は render-prop で受け取り、
 * 各項目は渡された close() を呼んでメニューを閉じる。
 */
export const HeaderMenu = ({ children }: HeaderMenuProps): ReactElement => {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const close = (): void => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="header-menu" ref={rootRef}>
      <button
        type="button"
        className="menu-button"
        aria-label="メニュー"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M3 6h18M3 12h18M3 18h18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          {children(close)}
        </div>
      )}
    </div>
  )
}
