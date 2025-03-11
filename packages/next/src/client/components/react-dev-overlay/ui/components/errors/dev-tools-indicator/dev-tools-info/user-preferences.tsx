import { useState, type HTMLProps } from 'react'
import { css } from '../../../../../utils/css'
import EyeIcon from '../../../../icons/eye-icon'
import { STORAGE_KEY_POSITION, STORAGE_KEY_THEME } from '../../../../../shared'
import LightIcon from '../../../../icons/light-icon'
import DarkIcon from '../../../../icons/dark-icon'
import SystemIcon from '../../../../icons/system-icon'
import type { DevToolsInfoPropsCore } from './dev-tools-info'
import { DevToolsInfo } from './dev-tools-info'
import type { DevToolsIndicatorPosition } from '../dev-tools-indicator'

function getInitialPreference() {
  if (typeof localStorage === 'undefined') {
    return 'system'
  }

  const theme = localStorage.getItem(STORAGE_KEY_THEME)
  return theme === 'dark' || theme === 'light' ? theme : 'system'
}

export function UserPreferences({
  setPosition,
  position,
  hide,
  ...props
}: {
  setPosition: (position: DevToolsIndicatorPosition) => void
  position: DevToolsIndicatorPosition
  hide: () => void
} & DevToolsInfoPropsCore &
  HTMLProps<HTMLDivElement>) {
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
            <label htmlFor="theme">Theme</label>
            <p className="preference-description">
              Select your theme preference.
            </p>
          </div>
          <Select
            id="theme"
            name="theme"
            prefix={<ThemeIcon theme={theme as 'dark' | 'light' | 'system'} />}
            value={theme}
            onChange={handleThemeChange}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <label htmlFor="position">Position</label>
            <p className="preference-description">
              Adjust the placement of your dev tools.
            </p>
          </div>
          <Select
            id="position"
            name="position"
            value={position}
            onChange={handlePositionChange}
          >
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
          </Select>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <label htmlFor="hide-dev-tools">
              Hide Dev Tools for this session
            </label>
            <p className="preference-description">
              Hide Dev Tools until you restart your dev server, or 1 day.
            </p>
          </div>
          <div className="preference-control">
            <button
              id="hide-dev-tools"
              name="hide-dev-tools"
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
            <label>Disable Dev Tools for this project</label>
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

function Select({
  children,
  prefix,
  ...props
}: {
  prefix?: React.ReactNode
} & React.HTMLProps<HTMLSelectElement>) {
  return (
    <div className="select-button">
      {prefix}
      <select {...props}>{children}</select>
      <ChevronDownIcon />
    </div>
  )
}

function ThemeIcon({ theme }: { theme: 'dark' | 'light' | 'system' }) {
  switch (theme) {
    case 'system':
      return <SystemIcon />
    case 'dark':
      return <DarkIcon />
    case 'light':
      return <LightIcon />
    default:
      return null
  }
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

  .preference-header label {
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

  .select-button {
    &:focus-within {
      outline: var(--focus-ring);
    }

    select {
      all: unset;
    }
  }

  :global(.icon) {
    width: 18px;
    height: 18px;
    color: #666;
  }
`

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.0607 5.49999L13.5303 6.03032L8.7071 10.8535C8.31658 11.2441 7.68341 11.2441 7.29289 10.8535L2.46966 6.03032L1.93933 5.49999L2.99999 4.43933L3.53032 4.96966L7.99999 9.43933L12.4697 4.96966L13 4.43933L14.0607 5.49999Z"
        fill="currentColor"
      />
    </svg>
  )
}
