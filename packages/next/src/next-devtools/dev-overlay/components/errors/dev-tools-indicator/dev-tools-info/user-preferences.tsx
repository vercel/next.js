import type {
  DevToolsIndicatorPosition,
  DevToolsScale,
} from '../../../../shared'

import { useDevOverlayContext } from '../../../../../dev-overlay.browser'
import { css } from '../../../../utils/css'
import EyeIcon from '../../../../icons/eye-icon'
import { NEXT_DEV_TOOLS_SCALE } from '../../../../shared'
import LightIcon from '../../../../icons/light-icon'
import DarkIcon from '../../../../icons/dark-icon'
import SystemIcon from '../../../../icons/system-icon'
import { ShortcutRecorder } from './shortcut-recorder'
import { useRestartServer } from '../../error-overlay-toolbar/use-restart-server'
import { saveDevToolsConfig } from '../../../../utils/save-devtools-config'

export function UserPreferencesBody({
  theme,
  hide,
  hideShortcut,
  setHideShortcut,
  scale,
  setPosition,
  setScale,
  position,
}: {
  theme: 'dark' | 'light' | 'system'
  hide: () => void
  hideShortcut: string | null
  setHideShortcut: (value: string | null) => void
  setPosition: (position: DevToolsIndicatorPosition) => void
  position: DevToolsIndicatorPosition
  scale: DevToolsScale
  setScale: (value: DevToolsScale) => void
}) {
  const { restartServer, isPending } = useRestartServer()
  const { shadowRoot } = useDevOverlayContext()

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const portal = shadowRoot.host
    if (e.target.value === 'system') {
      portal.classList.remove('dark')
      portal.classList.remove('light')
      saveDevToolsConfig({ theme: 'system' })
      return
    }

    if (e.target.value === 'dark') {
      portal.classList.add('dark')
      portal.classList.remove('light')
      saveDevToolsConfig({ theme: 'dark' })
    } else {
      portal.classList.remove('dark')
      portal.classList.add('light')
      saveDevToolsConfig({ theme: 'light' })
    }
  }

  function handlePositionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setPosition(e.target.value as DevToolsIndicatorPosition)
    saveDevToolsConfig({
      devToolsPosition: e.target.value as DevToolsIndicatorPosition,
    })
  }

  function handleSizeChange({ target }: React.ChangeEvent<HTMLSelectElement>) {
    const value = Number(target.value) as DevToolsScale
    setScale(value)
    saveDevToolsConfig({ scale: value })
  }

  return (
    <>
      <h2 className="dev-tools-info-section-title">General</h2>
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
            <label htmlFor="size">Size</label>
            <p className="preference-description">
              Adjust the size of your dev tools.
            </p>
          </div>
          <Select
            id="size"
            name="size"
            value={scale}
            onChange={handleSizeChange}
          >
            {Object.entries(NEXT_DEV_TOOLS_SCALE).map(([key, value]) => {
              return (
                <option value={value} key={key}>
                  {key}
                </option>
              )
            })}
          </Select>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <label id="hide-dev-tools">Hide Dev Tools for this session</label>
            <p className="preference-description">
              Hide Dev Tools until you restart your dev server, or 1 day.
            </p>
          </div>
          <div className="preference-control">
            <button
              aria-describedby="hide-dev-tools"
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
            <label id="hide-dev-tools">Hide Dev Tools shortcut</label>
            <p className="preference-description">
              Set a custom keyboard shortcut to toggle visibility.
            </p>
          </div>
          <div className="preference-control">
            <ShortcutRecorder
              value={hideShortcut?.split('+') ?? null}
              onChange={setHideShortcut}
            />
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
      <h2 className="dev-tools-info-section-title">Development Server</h2>
      <div className="preferences-container">
        <div className="preference-section">
          <div className="preference-header">
            <label id="restart-dev-server">Restart Dev Server</label>
            <p className="preference-description">
              Restarts the development server without needing to leave the
              browser.
            </p>
          </div>
          <div className="preference-control">
            <button
              aria-describedby="restart-dev-server"
              title="Restarts the development server without needing to leave the browser."
              name="restart-dev-server"
              data-restart-dev-server
              className="action-button"
              onClick={() =>
                restartServer({ invalidateFileSystemCache: false })
              }
              disabled={isPending}
            >
              <span>Restart</span>
            </button>
          </div>
        </div>
      </div>
      {process.env.__NEXT_BUNDLER_HAS_PERSISTENT_CACHE ? (
        <div className="preferences-container">
          <div className="preference-section">
            <div className="preference-header">
              <label id="reset-bundler-cache">Reset Bundler Cache</label>
              <p className="preference-description">
                Clears the bundler cache and restarts the dev server. Helpful if
                you are seeing stale errors or changes are not appearing.
              </p>
            </div>
            <div className="preference-control">
              <button
                aria-describedby="reset-bundler-cache"
                title="Clears the bundler cache and restarts the dev server. Helpful if you are seeing stale errors or changes are not appearing."
                name="reset-bundler-cache"
                data-reset-bundler-cache
                className="action-button"
                onClick={() =>
                  restartServer({ invalidateFileSystemCache: true })
                }
                disabled={isPending}
              >
                <span>Reset Cache</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Select({
  children,
  prefix,
  ...props
}: {
  prefix?: React.ReactNode
} & Omit<React.HTMLProps<HTMLSelectElement>, 'prefix'>) {
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
    transition: border-color 150ms var(--timing-swift);

    &:hover {
      border-color: var(--color-gray-500);
    }

    svg {
      width: 14px;
      height: 14px;
      overflow: visible;
    }
  }

  .select-button {
    &:focus-within {
      outline: var(--focus-ring);
      outline-offset: -1px;
    }

    select {
      all: unset;
    }

    option {
      color: var(--color-gray-1000);
      background: var(--color-background-100);
    }
  }

  .preference-section button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
