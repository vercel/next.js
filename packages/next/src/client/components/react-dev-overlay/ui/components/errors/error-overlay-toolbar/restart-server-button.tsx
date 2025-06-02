import { useState, useEffect } from 'react'
import { RefreshClockWise } from '../../../icons/refresh-clock-wise'

export function RestartServerButton({ error }: { error: Error }) {
  const [showButton, setShowButton] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const ERROR_KEY = `error-overlay:${window.location.pathname}:${error.message}`

    if (sessionStorage.getItem(ERROR_KEY) === '1') {
      setShowButton(true)
    } else {
      setShowButton(false)
    }

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

  return (
    <button className="restart-dev-server-button">
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
