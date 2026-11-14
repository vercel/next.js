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
import * as React from 'react'
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
        <Select id="size" name="size" value={scale} onChange={handleSizeChange}>
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
            <code className="dev-tools-info-code">devIndicators: false</code> in
            your <code className="dev-tools-info-code">next.config</code> file.
          </p>
        </div>
      </div>

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
            onClick={() => restartServer({ invalidateFileSystemCache: false })}
            disabled={isPending}
          >
            <span>Restart</span>
          </button>
        </div>
      </div>

      {process.env.__NEXT_BUNDLER_HAS_PERSISTENT_CACHE ? (
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
              onClick={() => restartServer({ invalidateFileSystemCache: true })}
              disabled={isPending}
            >
              <span>Reset Cache</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Select({
  children,
  prefix,
  value,
  onChange,
  id,
  name,
}: {
  prefix?: React.ReactNode
  value: string | number
  onChange: (e: any) => void
  id?: string
  name?: string
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const options = React.Children.toArray(children)
    .filter(
      (child): child is React.ReactElement =>
        React.isValidElement(child) && child.type === 'option'
    )
    .map((child) => {
      const props = child.props as {
        value: string | number
        children: React.ReactNode
      }
      return {
        value: props.value,
        label: props.children,
      }
    })

  const selectedOption =
    options.find((opt) => opt.value === value) || options[0]

  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const path = e.composedPath()
      if (containerRef.current && !path.includes(containerRef.current)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      window.addEventListener('click', handleOutsideClick)
    }
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [isOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (!isOpen) {
        setIsOpen(true)
        setFocusedIndex(options.findIndex((opt) => opt.value === value))
        e.preventDefault()
      } else if (focusedIndex !== -1) {
        selectValue(options[focusedIndex].value)
        e.preventDefault()
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        // Only close the dropdown, and prevent the Escape from bubbling to the
        // panel's document-level keydown handler, which would otherwise also
        // close the entire Preferences panel.
        e.stopPropagation()
        setIsOpen(false)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setFocusedIndex(options.findIndex((opt) => opt.value === value))
      } else {
        setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setFocusedIndex(options.findIndex((opt) => opt.value === value))
      } else {
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev))
      }
    }
  }

  const selectValue = (newValue: string | number | undefined) => {
    if (newValue === undefined) return
    const mockEvent = {
      target: { value: newValue, name, id },
    }
    onChange(mockEvent)
    setIsOpen(false)
  }

  return (
    <div
      className="select-container"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className="select-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        id={id}
        name={name}
      >
        {prefix}
        <span className="select-value">{selectedOption?.label}</span>
        <ChevronDownIcon />
      </button>

      {isOpen && (
        <ul className="select-dropdown" role="listbox">
          {options.map((opt, index) => (
            <li
              key={String(opt.value)}
              role="option"
              aria-selected={opt.value === value}
              className={`select-option ${focusedIndex === index ? 'focused' : ''}`}
              onClick={() => selectValue(opt.value)}
              onMouseEnter={() => setFocusedIndex(index)}
            >
              {opt.label}
              {opt.value === value && <CheckIcon />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"
        fill="currentColor"
      />
    </svg>
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

  .select-container {
    position: relative;
  }

  .select-button {
    &:focus-visible {
      outline: var(--focus-ring);
      outline-offset: -1px;
    }

    cursor: pointer;
    min-width: 140px;
    justify-content: space-between;
  }

  .select-value {
    flex: 1;
    text-align: left;
  }

  .select-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 100%;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-lg);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
  }

  .select-option {
    padding: 6px 8px;
    border-radius: var(--rounded-md);
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--size-14);
    color: var(--color-gray-1000);
    transition: background-color 150ms var(--timing-swift);
  }

  .select-option:hover,
  .select-option.focused {
    background: var(--color-gray-400);
  }

  .select-option[aria-selected='true'] {
    font-weight: 500;
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
