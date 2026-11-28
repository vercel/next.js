import type {
  DevToolsIndicatorPosition,
  DevToolsScale,
} from '../../../../shared'

import { useDevOverlayContext } from '../../../../../dev-overlay.browser'
import { css } from '../../../../utils/css'
import { NEXT_DEV_TOOLS_SCALE } from '../../../../shared'
import { ShortcutRecorder } from './shortcut-recorder'
import { useRestartServer } from '../../error-overlay-toolbar/use-restart-server'
import { saveDevToolsConfig } from '../../../../utils/save-devtools-config'

export function UserPreferencesBody({
  theme,
  toggleVisibility,
  hideShortcut,
  setHideShortcut,
  scale,
  setPosition,
  setScale,
  position,
}: {
  theme: 'dark' | 'light' | 'system'
  toggleVisibility: () => void
  hideShortcut: string | null
  setHideShortcut: (value: string | null) => void
  setPosition: (position: DevToolsIndicatorPosition) => void
  position: DevToolsIndicatorPosition
  scale: DevToolsScale
  setScale: (value: DevToolsScale) => void
}) {
  const { restartServer, isPending } = useRestartServer()
  const { shadowRoot, state } = useDevOverlayContext()

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

  const indicatorVisible = !state.disableDevIndicator

  return (
    <div className="preferences-container">
      <section className="preference-group" aria-labelledby="prefs-appearance">
        <h3 id="prefs-appearance" className="preference-group-title">
          Appearance
        </h3>
        <PreferenceRow
          id="theme"
          label="Theme"
          description="Light, dark, or match your system."
          docs="theme"
        >
          <Select
            id="theme"
            name="theme"
            value={theme}
            onChange={handleThemeChange}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </PreferenceRow>
        <PreferenceRow
          id="position"
          label="Position"
          description="Corner for the badge. You can also drag it."
          docs="position"
        >
          <Select
            id="position"
            name="position"
            value={position}
            onChange={handlePositionChange}
          >
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
          </Select>
        </PreferenceRow>
        <PreferenceRow
          id="size"
          label="Size"
          description="Scale of the badge and panels."
          docs="size"
        >
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
        </PreferenceRow>
      </section>

      <section
        className="preference-group indicator-preference"
        aria-labelledby="prefs-indicator"
      >
        <h3 id="prefs-indicator" className="preference-group-title">
          Indicator
        </h3>
        <PreferenceRow
          id="indicator-visibility"
          label="Show indicator"
          description="Diagnostics still appear when it's off."
          docs="show-indicator"
        >
          <button
            type="button"
            id="indicator-visibility"
            role="switch"
            aria-checked={indicatorVisible}
            aria-labelledby="indicator-visibility-label"
            name="toggle-dev-tools"
            data-hide-dev-tools
            className="preference-switch"
            onClick={toggleVisibility}
          >
            <span className="preference-switch-thumb" />
          </button>
        </PreferenceRow>
        <PreferenceRow
          id="indicator-shortcut"
          label="Shortcut"
          description="Toggle the indicator from the keyboard."
          docs="keyboard-shortcut"
        >
          <ShortcutRecorder
            value={hideShortcut?.split('+') ?? null}
            onChange={setHideShortcut}
          />
        </PreferenceRow>
      </section>

      <section className="preference-group" aria-labelledby="prefs-dev-server">
        <h3 id="prefs-dev-server" className="preference-group-title">
          Dev server
        </h3>
        <PreferenceRow
          id="restart-dev-server"
          label="Restart dev server"
          description="Restart without leaving the browser."
          docs="restart-dev-server"
        >
          <button
            type="button"
            id="restart-dev-server"
            aria-labelledby="restart-dev-server-label"
            title="Restarts the development server without needing to leave the browser."
            name="restart-dev-server"
            data-restart-dev-server
            className="action-button"
            onClick={() => restartServer({ invalidateFileSystemCache: false })}
            disabled={isPending}
          >
            Restart
          </button>
        </PreferenceRow>
        {process.env.__NEXT_BUNDLER_HAS_PERSISTENT_CACHE ? (
          <PreferenceRow
            id="reset-bundler-cache"
            label="Reset bundler cache"
            description="Fixes stale errors or changes not showing."
            docs="reset-bundler-cache"
          >
            <button
              type="button"
              id="reset-bundler-cache"
              aria-labelledby="reset-bundler-cache-label"
              title="Clears the bundler cache and restarts the dev server. Helpful if you are seeing stale errors or changes are not appearing."
              name="reset-bundler-cache"
              data-reset-bundler-cache
              className="action-button"
              onClick={() => restartServer({ invalidateFileSystemCache: true })}
              disabled={isPending}
            >
              Reset
            </button>
          </PreferenceRow>
        ) : null}
      </section>
    </div>
  )
}

const DOCS_URL = 'https://nextjs.org/docs/app/guides/devtools'

/**
 * One row of the Preferences grid: a label with its own docs link on the left
 * and a fixed-width control on the right. Every row and control has the same
 * size so the panel reads as a single grid.
 */
function PreferenceRow({
  id,
  label,
  description,
  docs,
  children,
}: {
  /** id of the control; the label gets `${id}-label`. */
  id: string
  label: string
  /** One short line explaining what the option does. */
  description: string
  docs: string
  children: React.ReactNode
}) {
  return (
    <div className="preference-row">
      <div className="preference-text">
        <div className="preference-label">
          <label id={`${id}-label`} htmlFor={id}>
            {label}
          </label>
          <a
            className="preference-docs-link"
            href={`${DOCS_URL}#${docs}`}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Learn more about ${label}`}
            title={`Learn more about ${label}`}
          >
            <HelpIcon />
          </a>
        </div>
        <p id={`${id}-description`} className="preference-description">
          {description}
        </p>
      </div>
      <div className="preference-control">{children}</div>
    </div>
  )
}

function HelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.4 6.3a1.7 1.7 0 0 1 3.3.5c0 1.1-1.7 1.4-1.7 2.4M8 11.2v.05"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
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

export const DEV_TOOLS_INFO_USER_PREFERENCES_STYLES = css`
  /* One grid: every row has the same height, every control is the same width and height
     in the same right-hand column, and every section uses the same spacing. */
  .preferences-container {
    --preference-control-width: 144px;
    --preference-control-height: 32px;
    width: 100%;
  }

  .preference-group {
    padding: 4px 0 12px;
    border-bottom: 1px solid var(--color-gray-400);

    &:first-child {
      padding-top: 0;
    }

    &:last-child {
      padding-bottom: 0;
      border-bottom: none;
    }

    & + & {
      padding-top: 12px;
    }
  }

  .preference-group-title {
    margin: 0;
    height: 28px;
    display: flex;
    align-items: flex-end;
    padding-bottom: 4px;
    box-sizing: border-box;
    font-size: var(--size-13);
    font-weight: 500;
    color: var(--color-gray-900);
  }

  .preference-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 52px;
    padding: 4px 0;
    box-sizing: border-box;
  }

  .preference-text {
    min-width: 0;
  }

  .preference-description {
    margin: 0;
    font-size: var(--size-13);
    line-height: var(--size-18);
    color: var(--color-gray-900);
  }

  .preference-label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;

    label {
      font-size: var(--size-14);
      font-weight: 400;
      color: var(--color-gray-1000);
      margin: 0;
    }
  }

  .preference-docs-link {
    display: inline-flex;
    color: var(--color-gray-700);
    border-radius: 50%;

    &:hover {
      color: var(--color-gray-1000);
    }

    &:focus-visible {
      outline: var(--focus-ring);
    }
  }

  .preference-control {
    flex: none;
    width: var(--preference-control-width);
    display: flex;
    justify-content: flex-end;
  }

  .select-button,
  .action-button,
  .preference-control .shortcut-recorder-button {
    width: var(--preference-control-width);
    height: var(--preference-control-height);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-lg);
    font-weight: 400;
    font-size: var(--size-14);
    color: var(--color-gray-1000);
    padding: 0 10px;
    white-space: nowrap;
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

  .action-button {
    justify-content: center;
  }

  .preference-control .shortcut-recorder {
    width: 100%;
  }

  .preference-control .shortcut-recorder-button {
    justify-content: space-between;

    &[data-has-shortcut='false'] {
      justify-content: center;
    }
  }

  .select-button {
    justify-content: space-between;

    &:focus-within {
      outline: var(--focus-ring);
      outline-offset: -1px;
    }

    select {
      all: unset;
      flex: 1;
      min-width: 0;
    }

    option {
      color: var(--color-gray-1000);
      background: var(--color-background-100);
    }
  }

  .preference-switch {
    position: relative;
    width: 32px;
    height: 18px;
    padding: 2px;
    border: 0;
    border-radius: var(--rounded-full);
    background: var(--color-gray-400);
    cursor: pointer;
    transition: background 150ms var(--timing-swift);

    &[aria-checked='true'] {
      background: var(--color-gray-1000);
    }

    &:focus-visible {
      outline: var(--focus-ring);
      outline-offset: 2px;
    }
  }

  .preference-switch-thumb {
    display: block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-background-100);
    transition: translate 150ms var(--timing-swift);

    [aria-checked='true'] > & {
      translate: 14px 0;
    }
  }

  .preferences-container button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
