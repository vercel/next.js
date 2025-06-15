import type {
  OverlayDispatch,
  OverlayState,
  DevToolsIndicatorPosition,
} from '../../../shared'

import { useTheme } from '../hooks/use-theme'
import { Select } from '../../select/select'
import {
  ACTION_DEVTOOLS_INDICATOR_POSITION,
  ACTION_DEVTOOLS_SCALE,
  STORAGE_KEY_POSITION,
  STORAGE_KEY_SCALE,
  STORAGE_KEY_THEME,
  NEXT_DEV_TOOLS_SCALE,
} from '../../../shared'
import { css } from '../../../utils/css'

import LightIcon from '../../../icons/light-icon'
import DarkIcon from '../../../icons/dark-icon'
import SystemIcon from '../../../icons/system-icon'
import EyeIcon from '../../../icons/eye-icon'

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

export function SettingsTab({
  state,
  dispatch,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
}) {
  const [theme, setTheme] = useTheme()

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
    dispatch({
      type: ACTION_DEVTOOLS_INDICATOR_POSITION,
      indicatorPosition: e.target.value as DevToolsIndicatorPosition,
    })
    localStorage.setItem(STORAGE_KEY_POSITION, e.target.value)
  }

  function handleSizeChange({ target }: React.ChangeEvent<HTMLSelectElement>) {
    const value = Number(target.value)
    dispatch({
      type: ACTION_DEVTOOLS_SCALE,
      scale: value,
    })
    localStorage.setItem(STORAGE_KEY_SCALE, value.toString())
  }

  function handleRestartDevServer() {
    let endpoint = '/__nextjs_restart_dev'

    if (process.env.__NEXT_TURBOPACK_PERSISTENT_CACHE) {
      endpoint = '/__nextjs_restart_dev?invalidatePersistentCache'
    }

    fetch(endpoint, {
      method: 'POST',
    }).then(() => {
      // TODO: poll server status and reload when the server is back up.
      // https://github.com/vercel/next.js/pull/80005
    })
  }

  function hide() {
    fetch('/__nextjs_disable_dev_indicator', {
      method: 'POST',
    })
  }

  return (
    <div data-nextjs-devtools-panel-settings>
      <div data-nextjs-devtools-panel-settings-section>
        <div data-nextjs-devtools-panel-settings-section-header>
          <label htmlFor="theme">Theme</label>
          <p data-nextjs-devtools-panel-settings-section-description>
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

      <div data-nextjs-devtools-panel-settings-section>
        <div data-nextjs-devtools-panel-settings-section-header>
          <label htmlFor="position">Position</label>
          <p data-nextjs-devtools-panel-settings-section-description>
            Adjust the placement of your dev tools.
          </p>
        </div>
        <Select
          id="position"
          name="position"
          value={state.indicatorPosition}
          onChange={handlePositionChange}
        >
          <option value="bottom-left">Bottom Left</option>
          <option value="bottom-right">Bottom Right</option>
          <option value="top-left">Top Left</option>
          <option value="top-right">Top Right</option>
        </Select>
      </div>

      <div data-nextjs-devtools-panel-settings-section>
        <div data-nextjs-devtools-panel-settings-section-header>
          <label htmlFor="size">Size</label>
          <p data-nextjs-devtools-panel-settings-section-description>
            Adjust the size of your dev tools.
          </p>
        </div>
        <Select
          id="size"
          name="size"
          value={state.scale}
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

      <div data-nextjs-devtools-panel-settings-section>
        <div data-nextjs-devtools-panel-settings-section-header>
          <label id="hide-dev-tools">Hide Dev Tools for this session</label>
          <p data-nextjs-devtools-panel-settings-section-description>
            Hide Dev Tools until you restart your dev server, or 1 day.
          </p>
        </div>
        <div>
          <button
            aria-describedby="hide-dev-tools"
            name="hide-dev-tools"
            data-hide-dev-tools
            data-nextjs-devtools-panel-settings-section-action-button
            onClick={hide}
          >
            <EyeIcon />
            <span>Hide</span>
          </button>
        </div>
      </div>

      <div data-nextjs-devtools-panel-settings-section>
        <div data-nextjs-devtools-panel-settings-section-header>
          <label>Disable Dev Tools for this project</label>
          <p data-nextjs-devtools-panel-settings-section-description>
            To disable this UI completely, set{' '}
            <code className="dev-tools-info-code">devIndicators: false</code> in
            your <code className="dev-tools-info-code">next.config</code> file.
          </p>
        </div>
      </div>

      <div data-nextjs-devtools-panel-settings-section>
        <div data-nextjs-devtools-panel-settings-section-header>
          <label id="restart-dev-server">Restart Dev Server</label>
          <p data-nextjs-devtools-panel-settings-section-description>
            Restarts the development server without needing to leave the
            browser.
          </p>
        </div>
        <div>
          <button
            aria-describedby="restart-dev-server"
            title="Restarts the development server without needing to leave the browser."
            name="restart-dev-server"
            data-restart-dev-server
            data-nextjs-devtools-panel-settings-section-action-button
            onClick={handleRestartDevServer}
          >
            <span>Restart</span>
          </button>
        </div>
      </div>

      {process.env.__NEXT_TURBOPACK_PERSISTENT_CACHE ? (
        <div data-nextjs-devtools-panel-settings-section>
          <div data-nextjs-devtools-panel-settings-section-header>
            <label id="reset-bundler-cache">Reset Bundler Cache</label>
            <p data-nextjs-devtools-panel-settings-section-description>
              Clears the bundler cache and restarts the dev server. Helpful if
              you are seeing stale errors or changes are not appearing.
            </p>
          </div>
          <div>
            <button
              aria-describedby="reset-bundler-cache"
              title="Clears the bundler cache and restarts the dev server. Helpful if you are seeing stale errors or changes are not appearing."
              name="reset-bundler-cache"
              data-reset-bundler-cache
              data-nextjs-devtools-panel-settings-section-action-button
              onClick={handleRestartDevServer}
            >
              <span>Reset Cache</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const DEVTOOLS_PANEL_TAB_SETTINGS_STYLES = css`
  [data-nextjs-devtools-panel-settings] {
    padding: 16px;
  }

  [data-nextjs-devtools-panel-settings-section]:first-child {
    padding-top: 0;
  }

  [data-nextjs-devtools-panel-settings-section] {
    padding: 12px 0;
    border-bottom: 1px solid var(--color-gray-400);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }

  [data-nextjs-devtools-panel-settings-section]:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  [data-nextjs-devtools-panel-settings-section-header] {
    margin-bottom: 0;
    flex: 1;
  }

  [data-nextjs-devtools-panel-settings-section-header] label {
    font-size: var(--size-14);
    font-weight: 500;
    color: var(--color-gray-1000);
    margin: 0;
  }

  [data-nextjs-devtools-panel-settings-section-description] {
    color: var(--color-gray-900);
    font-size: var(--size-14);
    margin: 0;
  }

  [data-nextjs-select],
  [data-nextjs-devtools-panel-settings-section-action-button] {
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

  [data-nextjs-select] {
    &:focus-within {
      outline: var(--focus-ring);
    }

    select {
      all: unset;
    }

    option {
      color: var(--color-gray-1000);
      background: var(--color-background-100);
    }
  }

  :global(.icon) {
    width: 18px;
    height: 18px;
    color: #666;
  }
`
