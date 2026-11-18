import { useEffect, useEffectEvent, useState } from 'react'
import type { DevToolsIndicatorPosition } from '../../shared'
import { Kbd } from '../errors/dev-tools-indicator/dev-tools-info/shortcut-recorder'
import './indicator-visibility-notice.css'

const NOTICE_DURATION_MS = 5000

/**
 * Brief confirmation shown where the badge was after it is hidden. It matches
 * the badge's dark style, says how to get the indicator back, and offers a
 * one-click Undo. It disappears after 5 seconds (paused while hovered or
 * focused).
 */
export function IndicatorVisibilityNotice({
  shortcut,
  position,
  onUndo,
  onDismiss,
}: {
  shortcut: string | null
  position: DevToolsIndicatorPosition
  onUndo: () => void
  onDismiss: () => void
}) {
  const [paused, setPaused] = useState(false)
  const [vertical, horizontal] = position.split('-')

  // `onDismiss` is a new function on every parent render, so it must not be a
  // dependency: otherwise each re-render restarts the timer and the notice
  // never goes away.
  const dismiss = useEffectEvent(onDismiss)
  useEffect(() => {
    if (paused) return
    const timeout = setTimeout(() => dismiss(), NOTICE_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [paused])

  return (
    <div
      className="indicator-visibility-notice"
      style={{ [vertical]: 20, [horizontal]: 20 }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div role="status" className="indicator-visibility-notice-text">
        <strong>Indicator hidden</strong>
        <span>
          {shortcut ? (
            <>
              Press{' '}
              <span className="indicator-visibility-notice-keys">
                {shortcut.split('+').map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>{' '}
              or restart the dev server to show it.
            </>
          ) : (
            'Restart the dev server to show it again.'
          )}
        </span>
      </div>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
