import { useDevOverlayContext } from '../../dev-overlay.browser'
import { useClickOutside } from '../components/errors/dev-tools-indicator/utils'
import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { getIndicatorOffset } from '../utils/indicator-metrics'
import { INDICATOR_PADDING } from '../components/devtools-indicator/devtools-indicator'
import {
  MenuContext,
  MenuItem,
} from '../components/errors/dev-tools-indicator/dev-tools-indicator'
import { usePanelRouterContext } from './context'
import { usePanelContext } from './panel-router'

export const DevtoolMenu = ({
  closeOnClickOutside = true,
  items,
}: {
  closeOnClickOutside?: boolean
  items: Array<
    | false
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
  const { setPanel, triggerRef } = usePanelRouterContext()
  const { mounted } = usePanelContext()

  const [vertical, horizontal] = state.devToolsPosition.split('-', 2)

  const menuRef = useRef<HTMLDivElement>(null)

  useClickOutside(menuRef, triggerRef, closeOnClickOutside && mounted, () => {
    setPanel(null)
  })
  useLayoutEffect(() => {
    selectMenuItem({
      index: selectedIndex === -1 ? 'first' : selectedIndex,
      menuRef,
      setSelectedIndex,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const { setSelectedIndex, selectedIndex } = usePanelRouterContext()

  function onMenuKeydown(e: React.KeyboardEvent<HTMLDivElement | null>) {
    console.log('i got a key down', e)

    e.preventDefault()

    const totalItems = definedItems.length

    switch (e.key) {
      case 'ArrowDown':
        const next = selectedIndex >= totalItems - 1 ? 0 : selectedIndex + 1
        selectMenuItem({ index: next, menuRef, setSelectedIndex })
        break
      case 'ArrowUp':
        const prev = selectedIndex <= 0 ? totalItems - 1 : selectedIndex - 1
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
            selectedIndex >= totalItems - 1 ? 0 : selectedIndex + 1
          selectMenuItem({ index: nextCtrl, menuRef, setSelectedIndex })
        }
        break
      case 'p':
        if (e.ctrlKey) {
          const prevCtrl =
            selectedIndex <= 0 ? totalItems - 1 : selectedIndex - 1
          selectMenuItem({ index: prevCtrl, menuRef, setSelectedIndex })
        }
        break
      default:
        break
    }
  }

  console.log('mounting menu again', onMenuKeydown)

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
        zIndex: 3,
        overflow: 'hidden',
        opacity: 1,
        minWidth: '248px',
        transition:
          'opacity var(--animate-out-duration-ms) var(--animate-out-timing-function)',
        border: '1px solid var(--color-gray-200)',
        ...positionStyle,
      }}
      // TODO: bring over keydown logic from old impl
      // onKeyDown={onMenuKeydown}
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
              onClick={() => {
                // we explicitly keep the previous selected state for quick peeking and reverting
                item.onClick?.()
              }}
              index={index}
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
              onClick={() => {
                item.onClick?.()
              }}
              {...item.attributes}
              index={itemsAboveFooter.length + index}
            />
          ))}
        </div>
      </MenuContext>
    </div>
  )
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

export function selectMenuItem({
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
  console.log('do we hav el to focus?', el)

  if (el) {
    setSelectedIndex(index)
    el?.focus()
  }
}
