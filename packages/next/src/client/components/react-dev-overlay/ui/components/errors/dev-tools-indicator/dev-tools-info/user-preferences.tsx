import { useState } from 'react'
import { DevToolsInfo } from './dev-tools-info'
import { css } from '../../../../../utils/css'
import type { DevToolsIndicatorPosition } from '../dev-tools-indicator'
import EyeIcon from '../../../../icons/eye-icon'
import { STORAGE_KEY_POSITION, STORAGE_KEY_THEME } from '../../../../../shared'
import LightIcon from '../../../../icons/light-icon'
import DarkIcon from '../../../../icons/dark-icon'

function getInitialPreference() {
  if (typeof localStorage === 'undefined') {
    return 'system'
  }

  const theme = localStorage.getItem(STORAGE_KEY_THEME)
  return theme === 'dark' || theme === 'light' ? theme : 'system'
}

export function UserPreferences({
  isOpen,
  setPosition,
  position,
  hide,
  ...props
}: {
  isOpen: boolean
  setPosition: (position: DevToolsIndicatorPosition) => void
  position: DevToolsIndicatorPosition
  hide: () => void
  style?: React.CSSProperties
  ref?: React.RefObject<HTMLElement | null>
}) {
  // derive initial theme from system preference
  const [theme, setTheme] = useState(getInitialPreference())

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const portal = document.querySelector('nextjs-portal')
    if (!portal) return

    setTheme(e.target.value)

    if (e.target.value === 'system') {
      portal.classList.remove('dark')
      portal.classList.remove('light')
      localStorage.removeItem(STORAGE_KEY_THEME)
      return
    }

    if (e.target.value === 'dark') {
      portal.classList.add('dark')
      portal.classList.remove('light')
      localStorage.setItem(STORAGE_KEY_THEME, 'dark')
    } else {
      portal.classList.remove('dark')
      portal.classList.add('light')
      localStorage.setItem(STORAGE_KEY_THEME, 'light')
    }
  }

  function handlePositionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setPosition(e.target.value as DevToolsIndicatorPosition)
    localStorage.setItem(STORAGE_KEY_POSITION, e.target.value)
  }

  return (
    <DevToolsInfo title="Preferences" {...props}>
      <div className="preferences-container">
        <div className="preference-section">
          <div className="preference-header">
            <h2>Theme</h2>
            <p className="preference-description">
              Select your theme preference.
            </p>
          </div>
          <div className="preference-control-select">
            <div className="preference-icon">
              <ThemeIcon theme={theme as 'dark' | 'light' | 'system'} />
            </div>
            <select
              className="select-button"
              value={theme}
              onChange={handleThemeChange}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <h2>Position</h2>
            <p className="preference-description">
              Adjust the placement of your dev tools.
            </p>
          </div>
          <div className="preference-control-select">
            <select
              className="select-button"
              value={position}
              onChange={handlePositionChange}
            >
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
            </select>
          </div>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <h2>Hide Dev Tools for this session</h2>
            <p className="preference-description">
              Hide Dev Tools until you restart your dev server, or 1 day.
            </p>
          </div>
          <div className="preference-control">
            <button
              data-hide-dev-tools
              className="action-button"
              onClick={hide}
            >
              <div className="preference-icon">
                <EyeIcon />
              </div>
              <span>Hide</span>
            </button>
          </div>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <h2>Disable Dev Tools for this project</h2>
            <p className="preference-description">
              To disable this UI completely, set{' '}
              <code className="dev-tools-info-code">devIndicators: false</code>{' '}
              in your <code className="dev-tools-info-code">next.config</code>{' '}
              file.
            </p>
          </div>
        </div>
      </div>
    </DevToolsInfo>
  )
}

function ThemeIcon({ theme }: { theme: 'dark' | 'light' | 'system' }) {
  const activeTheme =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme

  return activeTheme === 'dark' ? <DarkIcon /> : <LightIcon />
}

export const DEV_TOOLS_INFO_USER_PREFERENCES_STYLES = css`
  .preferences-container {
    padding: 8px 6px;
    width: 100%;
  }

  @media (min-width: 576px) {
    .preferences-container {
      width: 480px;
    }
  }

  .preference-section:first-child {
    padding-top: 0;
  }

  .preference-section {
    padding: 12px 0;
    border-bottom: 1px solid var(--color-gray-400);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }

  .preference-section:last-child {
    border-bottom: none;
  }

  .preference-header {
    margin-bottom: 0;
    flex: 1;
  }

  .preference-header h2 {
    font-size: var(--size-14);
    font-weight: 500;
    color: var(--color-gray-1000);
    margin: 0;
  }

  .preference-description {
    color: var(--color-gray-900);
    font-size: var(--size-14);
    margin: 0;
  }

  .preference-icon {
    display: flex;
    align-items: center;
    width: 16px;
    height: 16px;
  }

  .select-button,
  .action-button {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-lg);
    font-weight: 400;
    font-size: var(--size-14);
    color: var(--color-gray-1000);
    padding: 6px 8px;

    &:hover {
      background: var(--color-gray-100);
    }
  }

  .preference-control-select {
    padding: 6px 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: var(--rounded-lg);
    border: 1px solid var(--color-gray-400);

    &:hover {
      background: var(--color-gray-100);
    }

    &:focus-within {
      outline: 5px auto -webkit-focus-ring-color;
    }
  }

  .preference-control-select select {
    font-size: var(--size-14);
    font-weight: 400;
    border: none;
    padding: 0 6px 0 0;
    border-radius: 0;
    outline: none;
  }

  :global(.icon) {
    width: 18px;
    height: 18px;
    color: #666;
  }
`
