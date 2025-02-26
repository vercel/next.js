import { useState } from 'react'
import { DevToolsInfo } from './dev-tools-info'
import { css } from '../../../../../utils/css'
import type { DevToolsIndicatorPosition } from '../dev-tools-indicator'
import EyeIcon from '../../../../icons/eye-icon'
import { STORAGE_KEY_POSITION, STORAGE_KEY_THEME } from '../../../../../shared'

function getInitialPreference() {
  if (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(STORAGE_KEY_THEME)
  ) {
    return 'Dark'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'Dark'
    : 'Light'
}

export function UserPreferences({
  isOpen,
  setIsOpen,
  setPreviousOpen,
  setPosition,
  position,
  hide,
  ...props
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  setPreviousOpen: (isOpen: boolean) => void
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

    if (e.target.value === 'Dark') {
      portal.classList.add('dark')
      localStorage.setItem(STORAGE_KEY_THEME, '1')
    } else {
      portal.classList.remove('dark')
      localStorage.removeItem(STORAGE_KEY_THEME)
    }
  }

  function handlePositionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setPosition(e.target.value as DevToolsIndicatorPosition)
    localStorage.setItem(STORAGE_KEY_POSITION, e.target.value)
  }

  return (
    <DevToolsInfo
      title="Preferences"
      setIsOpen={setIsOpen}
      learnMoreLink="https://nextjs.org/docs/app/api-reference/config/next-config-js/devIndicators"
      setPreviousOpen={setPreviousOpen}
      {...props}
    >
      <div className="preferences-container">
        <div className="preference-section">
          <div className="preference-header">
            <h2>Theme</h2>
            <p className="preference-description">
              Select your theme preference.
            </p>
          </div>
          <div className="preference-control">
            <select
              className="select-button"
              value={theme}
              onChange={handleThemeChange}
            >
              <option value="Light">Light</option>
              <option value="Dark">Dark</option>
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
          <div className="preference-control">
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
            <h2>Hide Dev Tools for this Session</h2>
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
              <EyeIcon />
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

export const DEV_TOOLS_INFO_USER_PREFERENCES_STYLES = css`
  .preferences-container {
    padding: 8px 6px;
    width: 480px;
  }

  .preference-section:first-child {
    padding-top: 0;
  }

  .preference-section {
    padding: 8px 0;
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
    font-size: var(--size-14);s
    font-weight: 500;
    color: var(--color-gray-1000);
    margin: 0 0 4px 0;
  }

  .preference-description {
    color: var(--color-gray-900);
    font-size: var(--size-14);
    margin: 0;
  }

  .select-button,
  .action-button {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-background-200);
    border: 1px solid #eaeaea;
    border-radius: var(--rounded-lg);
    font-weight: 400;
    font-size: var(--size-14);
    color: var(--color-gray-1000);
    padding: 4px 8px;

    &:hover {
      background: var(--color-gray-400);
    }
  }

  :global(.icon) {
    width: 18px;
    height: 18px;
    color: #666;
  }
`
