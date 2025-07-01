import { useEffect } from 'react'
import { RefreshClockWise } from '../../../icons/refresh-clock-wise'
import {
  ACTION_RESTART_SERVER_BUTTON,
  type OverlayDispatch,
} from '../../../shared'
import type { SupportedErrorEvent } from '../../../container/runtime-error/render-error'

/**
 * When the Turbopack persistent cache is enabled, and the user reloads on a
 * specific error and that error persists, we show the restart server button as
 * an option. This is because some errors are recoverable by clearing the
 * bundler cache, but we want to provide a shortcut to do this and collect
 * telemetry on how often this is used.
 */
export function RestartServerButton({ showButton }: { showButton: boolean }) {
  if (!showButton) {
    return null
  }

  function handleClick() {
    // TODO: Use Client Action for transition indicator when DevTools is isolated.
    fetch('/__nextjs_restart_dev?invalidatePersistentCache', {
      method: 'POST',
    }).then(() => {
      // TODO: poll server status and reload when the server is back up.
      // https://github.com/vercel/next.js/pull/80005
    })
  }

  return (
    <button
      className="restart-dev-server-button"
      onClick={handleClick}
      title="Clears the bundler cache and restarts the dev server. Helpful if you are seeing stale errors or changes are not appearing."
    >
      <RefreshClockWise width={14} height={14} />
      Clear Bundler Cache &amp; Restart
    </button>
  )
}

/**
 * Sets up a beforeunload listener to show the restart server button
 * if the developer reloads on a specific error and that error persists with Turbopack + Persistent Cache.
 */
export function usePersistentCacheErrorDetection({
  errors,
  dispatch,
}: {
  errors: SupportedErrorEvent[]
  dispatch: OverlayDispatch
}) {
  useEffect(() => {
    const isTurbopackWithCache =
      process.env.__NEXT_BUNDLER?.toUpperCase() === 'TURBOPACK' &&
      process.env.__NEXT_BUNDLER_HAS_PERSISTENT_CACHE
    // TODO: Is there a better heuristic here?
    const firstError = errors[0]?.error

    if (isTurbopackWithCache && firstError) {
      const errorKey = `__next_error_overlay:${window.location.pathname}:${firstError.message}`
      const showRestartServerButton = sessionStorage.getItem(errorKey) === '1'

      dispatch({
        type: ACTION_RESTART_SERVER_BUTTON,
        showRestartServerButton,
      })

      const handleBeforeUnload = () => {
        sessionStorage.setItem(errorKey, '1')
      }

      window.addEventListener('beforeunload', handleBeforeUnload)
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    } else {
      dispatch({
        type: ACTION_RESTART_SERVER_BUTTON,
        showRestartServerButton: false,
      })
    }
  }, [errors, dispatch])
}

export const RESTART_SERVER_BUTTON_STYLES = `
  .restart-dev-server-button {
    -webkit-font-smoothing: antialiased;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4px;
    margin: 0 12px;

    height: var(--size-26);
    padding: 6px 8px 6px 6px;
    background: var(--color-amber-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    box-shadow: var(--shadow-small);
    border-radius: var(--rounded-full);

    color: var(--color-amber-900);
    font-size: var(--size-12);
    font-weight: 500;
    line-height: var(--size-16);
  }
`
