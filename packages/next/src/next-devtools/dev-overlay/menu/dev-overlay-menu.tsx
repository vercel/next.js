import { useDevOverlayContext } from '../../dev-overlay.browser'
import { useClickOutsideAndEscape } from '../components/errors/dev-tools-indicator/utils'
import {
  useEffectEvent,
  useLayoutEffect,
  useRef,
  createContext,
  useContext,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { getIndicatorOffset } from '../utils/indicator-metrics'
import { INDICATOR_PADDING } from '../components/devtools-indicator/devtools-indicator'
import { usePanelRouterContext } from './context'
import { usePanelContext } from './panel-router'

interface C {
  closeMenu?: () => void
  selectedIndex: number
  setSelectedIndex: Dispatch<SetStateAction<number>>
}

const MenuContext = createContext({} as C)

function MenuItem({
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
  const { closeMenu, selectedIndex, setSelectedIndex } = useContext(MenuContext)
  const selected = selectedIndex === index

  function click() {
    if (isInteractive) {
      onClick?.()
      closeMenu?.()
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

export const DevtoolMenu = ({
  closeOnClickOutside = true,
  items,
}: {
  closeOnClickOutside?: boolean
  items: Array<
    | false
    | undefined
    | null
    | {
        onClick?: () => void
        title?: string
        label: string
        value: React.ReactNode
        attributes?: Record<string, string | boolean>
        footer?: boolean
      }
  >
}) => {
  const { state } = useDevOverlayContext()
  const { setPanel, triggerRef, setSelectedIndex, selectedIndex } =
    usePanelRouterContext()
  const { mounted } = usePanelContext()

  const [vertical, horizontal] = state.devToolsPosition.split('-', 2)

  const menuRef = useRef<HTMLDivElement>(null)

  useClickOutsideAndEscape(
    menuRef,
    triggerRef,
    closeOnClickOutside && mounted,
    (reason) => {
      switch (reason) {
        case 'escape': {
          setPanel(null)
          setSelectedIndex(-1)
          return
        }
        case 'outside': {
          if (!closeOnClickOutside) {
            return
          }
          setPanel(null)
          setSelectedIndex(-1)
          return
        }
        default: {
          return null!
        }
      }
    }
  )
  const fireInitialSelectMenuItem = useEffectEvent(() => {
    selectMenuItem({
      index: selectedIndex === -1 ? 'first' : selectedIndex,
      menuRef,
      setSelectedIndex,
    })
  })

  useLayoutEffect(() => {
    menuRef.current?.focus() // allows keydown to be captured
    fireInitialSelectMenuItem()
  }, [])

  const indicatorOffset = getIndicatorOffset(state)

  const [indicatorVertical, indicatorHorizontal] = state.devToolsPosition.split(
    '-',
    2
  )

  const verticalOffset =
    vertical === indicatorVertical && horizontal === indicatorHorizontal
      ? indicatorOffset
      : INDICATOR_PADDING

  const positionStyle = {
    [vertical]: `${verticalOffset}px`,
    [horizontal]: `${INDICATOR_PADDING}px`,
    [vertical === 'top' ? 'bottom' : 'top']: 'auto',
    [horizontal === 'left' ? 'right' : 'left']: 'auto',
  } as CSSProperties
  const definedItems = items.filter((item) => !!item)
  const itemsAboveFooter = definedItems.filter((item) => !item.footer)
  const itemsBelowFooter = definedItems.filter((item) => item.footer)

  function onMenuKeydown(e: React.KeyboardEvent<HTMLDivElement | null>) {
    e.preventDefault()

    const clickableItems = definedItems.filter((item) => item.onClick)
    const totalClickableItems = clickableItems.length

    switch (e.key) {
      case 'ArrowDown':
        const next =
          selectedIndex >= totalClickableItems - 1 ? 0 : selectedIndex + 1
        selectMenuItem({ index: next, menuRef, setSelectedIndex })
        break
      case 'ArrowUp':
        const prev =
          selectedIndex <= 0 ? totalClickableItems - 1 : selectedIndex - 1
        selectMenuItem({ index: prev, menuRef, setSelectedIndex })
        break
      case 'Home':
        selectMenuItem({ index: 'first', menuRef, setSelectedIndex })
        break
      case 'End':
        selectMenuItem({ index: 'last', menuRef, setSelectedIndex })
        break
      case 'n':
        if (e.ctrlKey) {
          const nextCtrl =
            selectedIndex >= totalClickableItems - 1 ? 0 : selectedIndex + 1
          selectMenuItem({ index: nextCtrl, menuRef, setSelectedIndex })
        }
        break
      case 'p':
        if (e.ctrlKey) {
          const prevCtrl =
            selectedIndex <= 0 ? totalClickableItems - 1 : selectedIndex - 1
          selectMenuItem({ index: prevCtrl, menuRef, setSelectedIndex })
        }
        break
      default:
        break
    }
  }

  return (
    <div
      ref={menuRef}
      onKeyDown={onMenuKeydown}
      id="nextjs-dev-tools-menu"
      role="menu"
      dir="ltr"
      aria-orientation="vertical"
      aria-label="Next.js Dev Tools Items"
      tabIndex={-1}
      style={{
        outline: 0,
        WebkitFontSmoothing: 'antialiased',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        background: 'var(--color-background-100)',

        backgroundClip: 'padding-box',
        boxShadow: 'var(--shadow-menu)',
        borderRadius: 'var(--rounded-xl)',
        position: 'fixed',
        fontFamily: 'var(--font-stack-sans)',
        zIndex: 'var(--top-z-index)',
        overflow: 'hidden',
        opacity: 1,
        minWidth: '248px',
        transition:
          'opacity var(--animate-out-duration-ms) var(--animate-out-timing-function)',
        border: '1px solid var(--color-gray-alpha-400)',
        ...positionStyle,
      }}
    >
      <MenuContext
        value={{
          selectedIndex,
          setSelectedIndex,
        }}
      >
        <div style={{ padding: '6px', width: '100%' }}>
          {itemsAboveFooter.map((item, index) => (
            <MenuItem
              key={item.label}
              title={item.title}
              label={item.label}
              value={item.value}
              onClick={item.onClick}
              index={
                item.onClick
                  ? getAdjustedIndex(itemsAboveFooter, index)
                  : undefined
              }
              {...item.attributes}
            />
          ))}
        </div>
        <div className="dev-tools-indicator-footer">
          {itemsBelowFooter.map((item, index) => (
            <MenuItem
              key={item.label}
              title={item.title}
              label={item.label}
              value={item.value}
              onClick={item.onClick}
              {...item.attributes}
              index={
                item.onClick
                  ? getAdjustedIndex(itemsBelowFooter, index) +
                    getClickableItemsCount(itemsAboveFooter)
                  : undefined
              }
            />
          ))}
        </div>
      </MenuContext>
    </div>
  )
}

function getAdjustedIndex(
  items: Array<{ onClick?: () => void }>,
  targetIndex: number
): number {
  let adjustedIndex = 0

  for (let i = 0; i <= targetIndex && i < items.length; i++) {
    if (items[i].onClick) {
      if (i === targetIndex) {
        return adjustedIndex
      }
      adjustedIndex++
    }
  }

  return adjustedIndex
}

function getClickableItemsCount(
  items: Array<{ onClick?: () => void }>
): number {
  return items.filter((item) => item.onClick).length
}

export function IssueCount({ children }: { children: number }) {
  return (
    <span
      className="dev-tools-indicator-issue-count"
      data-has-issues={children > 0}
    >
      <span className="dev-tools-indicator-issue-count-indicator" />
      {children}
    </span>
  )
}

export function ChevronRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        fill="#666"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.50011 1.93945L6.03044 2.46978L10.8537 7.293C11.2442 7.68353 11.2442 8.31669 10.8537 8.70722L6.03044 13.5304L5.50011 14.0608L4.43945 13.0001L4.96978 12.4698L9.43945 8.00011L4.96978 3.53044L4.43945 3.00011L5.50011 1.93945Z"
      />
    </svg>
  )
}

function selectMenuItem({
  index,
  menuRef,
  setSelectedIndex,
}: {
  index: number | 'first' | 'last'
  menuRef: React.RefObject<HTMLDivElement | null>
  setSelectedIndex: (index: number) => void
}) {
  if (index === 'first') {
    setTimeout(() => {
      const all = menuRef.current?.querySelectorAll('[role="menuitem"]')
      if (all) {
        const firstIndex = all[0].getAttribute('data-index')
        selectMenuItem({ index: Number(firstIndex), menuRef, setSelectedIndex })
      }
    })
    return
  }

  if (index === 'last') {
    setTimeout(() => {
      const all = menuRef.current?.querySelectorAll('[role="menuitem"]')
      if (all) {
        const lastIndex = all.length - 1
        selectMenuItem({ index: lastIndex, menuRef, setSelectedIndex })
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
