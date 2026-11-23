import type { JSX } from 'react'
import { useState, useRef } from 'react'
import { css } from '../../../../utils/css'

const SUCCESS_FADE_DELAY_MS = 1000

const modifierKeys = ['Meta', 'Control', 'Ctrl', 'Alt', 'Option', 'Shift']

export function ShortcutRecorder({
  value,
  onChange,
}: {
  value: string[] | null
  onChange: (value: string | null) => void
}) {
  const [recording, setRecording] = useState(false)
  const [keys, setKeys] = useState<string[]>(value ?? [])
  const [success, setSuccess] = useState<boolean>(false)
  const timeoutRef = useRef<number | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hasShortcut = Boolean(value) || keys.length > 0

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!recording || e.target !== buttonRef.current || e.key === 'Tab') return

    e.preventDefault()
    e.stopPropagation()

    const next: string[] = []
    if (e.metaKey) next.push('Meta')
    if (e.ctrlKey) next.push('Control')
    if (e.altKey) next.push('Alt')
    if (e.shiftKey) next.push('Shift')

    // Wait for an action key before saving. Physical key codes also work
    // when a modifier changes the character, such as Option+L on macOS.
    if (modifierKeys.includes(e.key)) {
      setKeys(next)
      return
    }

    next.push(e.code)
    setKeys(next)
    onChange(next.join('+'))
    setRecording(false)
    setSuccess(true)
    timeoutRef.current = window.setTimeout(() => {
      setSuccess(false)
    }, SUCCESS_FADE_DELAY_MS)
  }

  function clear() {
    buttonRef.current?.focus()
    setKeys([])
    setSuccess(false)
    setRecording(true)
    onChange(null)
  }

  function onBlur() {
    setRecording(false)
    if (!success) setKeys(value ?? [])
  }

  function onStart() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setKeys([])
    setSuccess(false)
    setRecording(true)
    buttonRef.current?.focus()
  }

  return (
    <div className="shortcut-recorder">
      <button
        className="shortcut-recorder-button"
        id="indicator-shortcut"
        aria-labelledby="indicator-shortcut-label"
        ref={buttonRef}
        onClick={onStart}
        onFocus={onStart}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        data-has-shortcut={hasShortcut}
        data-shortcut-recorder={recording ? 'true' : undefined}
      >
        {/* Recording and saved states are shown inside the button so the
            layout never shifts. */}
        {recording && keys.length === 0 ? (
          <span className="shortcut-recorder-hint">Press shortcut…</span>
        ) : !hasShortcut ? (
          'Record shortcut'
        ) : (
          <div className="shortcut-recorder-keys">
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </div>
        )}
        {success && !recording ? (
          <span className="shortcut-recorder-saved" aria-hidden>
            Saved
          </span>
        ) : (
          hasShortcut &&
          !recording && (
            <div
              className="shortcut-recorder-clear-button"
              role="button"
              onClick={clear}
              onFocus={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  clear()
                  e.stopPropagation()
                }
              }}
              aria-label="Clear shortcut"
              tabIndex={0}
            >
              <IconCross />
            </div>
          )
        )}
      </button>
      <span className="shortcut-recorder-status-message" role="status">
        {recording ? 'Recording…' : success ? 'Shortcut saved' : null}
      </span>
    </div>
  )
}

export function Kbd({ children }: { children: string }) {
  function renderKey(key: string) {
    switch (key) {
      case 'Meta':
        // Command symbol (⌘) on macOS
        // On non-macOS, shows "Ctrl"
        return <MetaKey />
      case 'Alt':
      case 'Option':
        // Option symbol (⌥)
        return '⌥'
      case 'Control':
      case 'Ctrl':
        // Control abbreviation
        return 'Ctrl'
      case 'Shift':
        // Shift symbol (⇧)
        return '⇧'
      case 'Enter':
        // Enter symbol (⏎)
        return '⏎'
      case 'Escape':
      case 'Esc':
        return 'Esc'
      case ' ':
      case 'Space':
      case 'Spacebar':
        return 'Space'
      case 'ArrowUp':
        return '↑'
      case 'ArrowDown':
        return '↓'
      case 'ArrowLeft':
        return '←'
      case 'ArrowRight':
        return '→'
      case 'Tab':
        return 'Tab'
      case 'Backspace':
        return '⌫'
      case 'Delete':
        return '⌦'
      default:
        // Capitalize single letters, otherwise show as-is
        if (children.length === 1) {
          return children.toUpperCase()
        }
        return children
    }
  }
  const key = renderKey(children)
  const isSymbol = typeof key === 'string' ? key.length === 1 : false
  return <kbd data-symbol={isSymbol}>{parseKeyCode(key)}</kbd>
}

function parseKeyCode(code: string | JSX.Element) {
  if (typeof code !== 'string') return code

  // Map common KeyboardEvent.code values to their corresponding key values
  const codeToKeyMap: Record<string, string> = {
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Backquote: '`',
    Space: ' ',
    Slash: '/',
    IntlBackslash: '\\',
    // Add more as needed
  }

  if (Object.prototype.hasOwnProperty.call(codeToKeyMap, code)) {
    return codeToKeyMap[code]
  }

  // Handle KeyA-Z, Digit0-9, Numpad0-9, NumpadAdd, etc.
  if (/^Key([A-Z])$/.test(code)) {
    return code.replace(/^Key/, '')
  }
  if (/^Digit([0-9])$/.test(code)) {
    return code.replace(/^Digit/, '')
  }
  if (/^Numpad([0-9])$/.test(code)) {
    return code.replace(/^Numpad/, '')
  }
  if (code === 'NumpadAdd') return '+'
  if (code === 'NumpadSubtract') return '-'
  if (code === 'NumpadMultiply') return '*'
  if (code === 'NumpadDivide') return '/'
  if (code === 'NumpadDecimal') return '.'
  if (code === 'NumpadEnter') return 'Enter'

  return code
}

function MetaKey() {
  const label = isApple()
    ? // Meta is Command on Apple devices, otherwise Control
      '⌘'
    : // Explicitly say "Ctrl" instead of the symbol "⌃"
      // because most Windows/Linux laptops do not print the symbol
      // Other keyboard-intensive apps like Linear do this
      'Ctrl'

  return (
    <span style={{ minWidth: '1em', display: 'inline-block' }}>{label}</span>
  )
}

function IconCross() {
  return (
    <svg height="16" strokeLinejoin="round" viewBox="0 0 16 16" width="16">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.4697 13.5303L13 14.0607L14.0607 13L13.5303 12.4697L9.06065 7.99999L13.5303 3.53032L14.0607 2.99999L13 1.93933L12.4697 2.46966L7.99999 6.93933L3.53032 2.46966L2.99999 1.93933L1.93933 2.99999L2.46966 3.53032L6.93933 7.99999L2.46966 12.4697L1.93933 13L2.99999 14.0607L3.53032 13.5303L7.99999 9.06065L12.4697 13.5303Z"
        fill="currentColor"
      />
    </svg>
  )
}

export const SHORTCUT_RECORDER_STYLES = css`
  .shortcut-recorder {
    display: flex;
    justify-content: center;
    flex-direction: column;
    align-items: flex-end;
    position: relative;
    font-family: var(--font-stack-sans);

    .shortcut-recorder-button {
      display: flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 1px dashed var(--color-gray-500);
      border-radius: var(--rounded-lg);
      padding: 6px 8px;
      font-weight: 400;
      font-size: var(--size-14);
      color: var(--color-gray-1000);
      transition: border-color 150ms var(--timing-swift);

      &[data-has-shortcut='true'] {
        border: 1px solid var(--color-gray-alpha-400);

        &:hover {
          border-color: var(--color-gray-500);
        }
      }

      &:hover {
        border-color: var(--color-gray-600);
      }

      &::placeholder {
        color: var(--color-gray-900);
      }

      &[data-pristine='false']::placeholder {
        color: transparent;
      }

      &:focus-visible {
        outline: var(--focus-ring);
        outline-offset: -1px;
      }
    }

    kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-stack-sans);
      background: var(--color-gray-200);
      min-width: 20px;
      height: 20px;
      font-size: 14px;
      border-radius: 4px;
      color: var(--color-gray-1000);

      &[data-symbol='false'] {
        padding: 0 4px;
      }
    }

    .shortcut-recorder-clear-button {
      cursor: pointer;
      color: var(--color-gray-1000);
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 150ms var(--timing-swift);

      &:hover {
        background: var(--color-gray-300);
      }

      &:focus-visible {
        outline: var(--focus-ring);
      }

      svg {
        width: 14px;
        height: 14px;
      }
    }
  }

  /* Announced to screen readers; the visible state is inside the button. */
  .shortcut-recorder-status-message {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .shortcut-recorder-hint {
    color: var(--color-gray-900);
  }

  .shortcut-recorder-saved {
    font-size: var(--size-13);
    color: var(--color-gray-900);
  }

  .shortcut-recorder-keys {
    pointer-events: none;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 2px;
  }
`

///////////////////////////////////////////////////////////////////////////////////////////////////

function testPlatform(re: RegExp): boolean | undefined {
  return window.navigator != null
    ? re.test(window.navigator.platform)
    : undefined
}

function isMac(): boolean | undefined {
  return testPlatform(/^Mac/)
}

function isIPhone(): boolean | undefined {
  return testPlatform(/^iPhone/)
}

function isIPad(): boolean | undefined {
  return (
    testPlatform(/^iPad/) ||
    // iPadOS 13 lies and says it's a Mac, but we can distinguish by detecting touch support.
    (isMac() && navigator.maxTouchPoints > 1)
  )
}

function isApple(): boolean | undefined {
  return isMac() || isIPhone() || isIPad()
}
