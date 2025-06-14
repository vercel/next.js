import { useState, useEffect } from 'react'
import { RefreshClockWise } from '../../../icons/refresh-clock-wise'

/**
 * When the user reloads on a specific error and that error persists, we show
 * the restart server button as an option. This is because some errors are
 * recoverable by restarting the server and rebuilding the app.
 *
 * When Turbopack persistent cache is enabled, it will also clear the bundler
 * cache. This improves DX by replacing the need to run `rm -rf .next` manually.
 */
export function RestartServerButton({ error }: { error: Error }) {
  const [showButton, setShowButton] = useState(false)

  useEffect(() => {
    const ERROR_KEY = `__next_error_overlay:${window.location.pathname}:${error.message}`

    setShowButton(sessionStorage.getItem(ERROR_KEY) === '1')

    // When the user tries to reload, set the error key to the session storage.
    const handleBeforeUnload = () => {
      sessionStorage.setItem(ERROR_KEY, '1')
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [error.message])

  if (!showButton) {
    return null
  }

  function handleClick() {
    let endpoint = '/__nextjs_restart_dev'

    if (process.env.__NEXT_TURBOPACK_PERSISTENT_CACHE) {
      endpoint = '/__nextjs_restart_dev?invalidatePersistentCache'
    }

    // TODO: Use Client Action for transition indicator when DevTools is isolated.
    fetch(endpoint, {
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
      title={
        process.env.__NEXT_TURBOPACK_PERSISTENT_CACHE
          ? 'Clears the bundler cache and restarts the dev server. Helpful if you are seeing stale errors or changes are not appearing.'
          : 'Restarts the development server without needing to leave the browser.'
      }
    >
      <RefreshClockWise width={14} height={14} />
      Restart Dev Server
    </button>
  )
}

export const RESTART_SERVER_BUTTON_STYLES = `
  .restart-dev-server-button {
    -webkit-font-smoothing: antialiased;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4px;

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
