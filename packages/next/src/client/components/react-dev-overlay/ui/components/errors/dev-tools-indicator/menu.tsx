import type { Dispatch, SetStateAction } from 'react'
import type { DevToolsInfoPropsCore } from './dev-tools-info/dev-tools-info'
import { useClickOutside, useFocusTrap } from './utils'
import { useState, useRef, createContext, useContext } from 'react'

interface C {
  closeMenu: () => void
  selectedIndex: number
  setSelectedIndex: Dispatch<SetStateAction<number>>
}

const Context = createContext({} as C)

interface MenuProps
  extends DevToolsInfoPropsCore,
    React.HTMLAttributes<HTMLDivElement> {
  isOpen: boolean
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export function Menu({ triggerRef, isOpen, close, ...props }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  // Features to make the menu accessible
  useFocusTrap(menuRef, triggerRef, isOpen)
  useClickOutside(menuRef, triggerRef, isOpen, close)

  function select(index: number | 'first' | 'last') {
    if (index === 'first') {
      setTimeout(() => {
        const all = menuRef.current?.querySelectorAll('[role="menuitem"]')
        if (all) {
          const firstIndex = all[0].getAttribute('data-index')
          select(Number(firstIndex))
        }
      })
      return
    }

    if (index === 'last') {
      setTimeout(() => {
        const all = menuRef.current?.querySelectorAll('[role="menuitem"]')
        if (all) {
          const lastIndex = all.length - 1
          select(lastIndex)
        }
      })
      return
    }

    const el = menuRef.current?.querySelector(
      `[data-index="${index}"]`
    ) as HTMLElement

    if (el) {
      setSelectedIndex(index)
      el?.focus()
    }
  }

  function onMenuKeydown(e: React.KeyboardEvent<HTMLDivElement>) {
    e.preventDefault()

    switch (e.key) {
      case 'ArrowDown':
        const next = selectedIndex + 1
        select(next)
        break
      case 'ArrowUp':
        const prev = selectedIndex - 1
        select(prev)
        break
      case 'Home':
        select('first')
        break
      case 'End':
        select('last')
        break
      default:
        break
    }
  }

  return (
    <Context.Provider
      value={{
        closeMenu: close,
        selectedIndex,
        setSelectedIndex,
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        dir="ltr"
        aria-orientation="vertical"
        tabIndex={-1}
        className="dev-tools-indicator-menu"
        onKeyDown={onMenuKeydown}
        data-rendered={isOpen}
        {...props}
      />
    </Context.Provider>
  )
}

export function MenuItem({
  index,
  label,
  value,
  onClick,
  href,
  ...props
}: {
  index?: number
  title?: string
  label: string
  value: React.ReactNode
  href?: string
  onClick?: () => void
}) {
  const isInteractive =
    typeof onClick === 'function' || typeof href === 'string'
  const { closeMenu, selectedIndex, setSelectedIndex } = useContext(Context)
  const selected = selectedIndex === index

  function click() {
    if (isInteractive) {
      onClick?.()
      closeMenu()
      if (href) {
        window.open(href, '_blank', 'noopener, noreferrer')
      }
    }
  }

  return (
    <div
      className="dev-tools-indicator-item"
      data-index={index}
      data-selected={selected}
      onClick={click}
      // Needs `onMouseMove` instead of enter to work together
      // with keyboard and mouse input
      onMouseMove={() => {
        if (isInteractive && index !== undefined && selectedIndex !== index) {
          setSelectedIndex(index)
        }
      }}
      onMouseLeave={() => setSelectedIndex(-1)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          click()
        }
      }}
      role={isInteractive ? 'menuitem' : undefined}
      tabIndex={selected ? 0 : -1}
      {...props}
    >
      <span className="dev-tools-indicator-label">{label}</span>
      <span className="dev-tools-indicator-value">{value}</span>
    </div>
  )
}

export const DEV_TOOLS_INDICATOR_MENU_STYLES = `
  .dev-tools-indicator-menu {
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-400);
    background-clip: padding-box;
    box-shadow: var(--shadow-menu);
    border-radius: var(--rounded-xl);
    position: absolute;
    font-family: var(--font-stack-sans);
    z-index: 1000;
    overflow: hidden;
    opacity: 0;
    outline: 0;
    min-width: 248px;
    transition: opacity var(--animate-out-duration-ms)
      var(--animate-out-timing-function);

    &[data-rendered='true'] {
      opacity: 1;
      scale: 1;
    }
  }

  .dev-tools-indicator-item {
    display: flex;
    align-items: center;
    padding: 8px 6px;
    height: var(--size-36);
    border-radius: 6px;
    text-decoration: none !important;
    user-select: none;
    white-space: nowrap;

    svg {
      width: var(--size-16);
      height: var(--size-16);
    }

    &:focus-visible {
      outline: 0;
    }
  }
`
