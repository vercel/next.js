import type { JSX } from 'react'
import { useState, useRef } from 'react'
import { css } from '../../../../utils/css'

const SUCCESS_SHOW_DELAY_MS = 180
const SUCCESS_FADE_DELAY_MS = 1000

const modifierKeys = ['Meta', 'Control', 'Ctrl', 'Alt', 'Option', 'Shift']

export function ShortcutRecorder({
  value,
  onChange,
}: {
  value: string[] | null
  onChange: (value: string | null) => void
}) {
  const [pristine, setPristine] = useState(true)
  const [show, setShow] = useState(false)
  const [keys, setKeys] = useState<string[]>(value ?? [])
  const [success, setSuccess] = useState<boolean>(false)
  const timeoutRef = useRef<number | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hasShortcut = Boolean(value) || keys.length > 0

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    // Don't handle events from the Clear button
    if (e.target !== buttonRef.current) return
    if (e.key === 'Tab') return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    if (!show) {
      setShow(true)
    }

    // Reset current shortcut on first key press
    // if this is a fresh recording session
    if (pristine) {
      setKeys([])
      setPristine(false)
    }

    function handleValidation(next: string[]) {
      timeoutRef.current = window.setTimeout(() => {
        setSuccess(true)
        onChange(next.join('+'))
        timeoutRef.current = window.setTimeout(() => {
          setShow(false)
        }, SUCCESS_FADE_DELAY_MS)
      }, SUCCESS_SHOW_DELAY_MS)
    }

    e.preventDefault()
    e.stopPropagation()

    setKeys((prev) => {
      // Don't add duplicate keys
      if (prev.includes(e.code) || prev.includes(e.key)) return prev

      /**
       * Why are we using `e.code` for non-modifier keys?
       *
       * Consider this keybind: Alt + L
       *
       * If we capture `e.key` here then it will correspond to an awkward symbol (¬)
       * because pressing Alt + L creates this symbol.
       *
       * While `e.code` will give us `KeyL` as the value which we also later use in
       * `useShortcuts()` to match the keybind correctly without relying on modifier symbols.
       */
      // Handle non-modifier keys (action keys)
      if (!modifierKeys.includes(e.key)) {
        // Replace existing non-modifier key if present
        const existingNonModifierIndex = prev.findIndex(
          (key) => !modifierKeys.includes(key)
        )
        if (existingNonModifierIndex !== -1) {
          const next = [...prev]
          next[existingNonModifierIndex] = e.code
          handleValidation(next)
          return next
        }
        // Add new non-modifier key at the end
        const next = [...prev, e.code]
        handleValidation(next)
        return next
      }

      // Handle modifier keys
      const next = [...prev]

      // Find the correct position for the modifier key based on predefined order
      const keyOrderIndex = modifierKeys.indexOf(e.key)
      let insertIndex = 0

      // Find where to insert by checking existing modifier keys
      for (let i = 0; i < next.length; i++) {
        if (modifierKeys.includes(next[i])) {
          const existingOrderIndex = modifierKeys.indexOf(next[i])
          if (keyOrderIndex < existingOrderIndex) {
            insertIndex = i
            break
          }
          insertIndex = i + 1
        } else {
          // Stop at first non-modifier key
          break
        }
      }

      next.splice(insertIndex, 0, e.key)
      handleValidation(next)
      return next
    })
  }

  function clear() {
    buttonRef.current?.focus()
    setKeys([])
    setSuccess(false)
    setTimeout(() => {
      setShow(true)
    })
    onChange(null)
  }

  function onBlur() {
    setSuccess(false)
    setShow(false)
    setPristine(true)
  }

  function onStart() {
    // Clear out timeouts for hiding the tooltip after success
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShow(true)
    buttonRef.current?.focus()
  }

  return (
    <div className="shortcut-recorder">
      <button
        className="shortcut-recorder-button"
        ref={buttonRef}
        onClick={onStart}
        onFocus={onStart}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        data-has-shortcut={hasShortcut}
        data-shortcut-recorder="true"
      >
        {!hasShortcut ? (
          'Record Shortcut'
        ) : (
          <div className="shortcut-recorder-keys">
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </div>
        )}
        {hasShortcut && (
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
        )}
      </button>
      <div className="shortcut-recorder-tooltip" data-show={show}>
        <div className="shortcut-recorder-status">
          <div
            className="shortcut-recorder-status-icon"
            data-success={success}
          />
          {success ? 'Shortcut set' : 'Recording'}
        </div>
        <BottomArrow />
      </div>
    </div>
  )
}

function BottomArrow() {
  return (
    <svg
      fill="none"
      height="6"
      viewBox="0 0 14 6"
      width="14"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.8284 0H0.17157C0.702003 0 1.21071 0.210714 1.58578 0.585787L5.58578 4.58579C6.36683 5.36684 7.63316 5.36683 8.41421 4.58579L12.4142 0.585786C12.7893 0.210714 13.298 0 13.8284 0Z"
        fill="var(--background)"
      />
    </svg>
  )
}

function Kbd({ children }: { children: string }) {
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

  if (codeToKeyMap[code]) {
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
    align-items: center;
    justify-content: center;
    gap: 8px;
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

  .shortcut-recorder-keys {
    pointer-events: none;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .shortcut-recorder-tooltip {
    --gap: 8px;
    --background: var(--color-gray-1000);
    background: var(--background);
    color: var(--color-background-100);
    font-size: var(--size-14);
    padding: 4px 8px;
    border-radius: 8px;
    position: absolute;
    bottom: calc(100% + var(--gap));
    text-align: center;
    opacity: 0;
    scale: 0.96;
    white-space: nowrap;
    user-select: none;
    transition:
      opacity 150ms var(--timing-swift),
      scale 150ms var(--timing-swift);

    &[data-show='true'] {
      opacity: 1;
      scale: 1;
    }

    svg {
      position: absolute;
      transform: translateX(-50%);
      bottom: -6px;
      left: 50%;
    }

    .shortcut-recorder-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .shortcut-recorder-status-icon {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--color-red-700);

      &[data-success='true'] {
        background: var(--color-green-700);
      }
    }
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
