import { useEffect, useState } from 'react'
import type { DevToolsIndicatorPosition } from '../../shared'
import './indicator-visibility-notice.css'

/**
 * Brief confirmation shown where the badge was after it is hidden. It matches
 * the badge (a dark pill in the same corner) and offers a one-click Undo.
 */
export function IndicatorVisibilityNotice({
  position,
  onUndo,
  onDismiss,
}: {
  position: DevToolsIndicatorPosition
  onUndo: () => void
  onDismiss: () => void
}) {
  const [paused, setPaused] = useState(false)
  const [vertical, horizontal] = position.split('-')

  useEffect(() => {
    if (paused) return
    const timeout = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timeout)
  }, [paused, onDismiss])

  return (
    <div
      className="indicator-visibility-notice"
      style={{ [vertical]: 20, [horizontal]: 20 }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span role="status">Indicator hidden</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
