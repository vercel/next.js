import type { Dispatch, SetStateAction } from 'react'
import type { OverlayState } from '../../../../../shared'

import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Toast } from '../../toast'
import { Cross, NextLogo } from './internal/next-logo'
import { useIsDevBuilding } from '../../../../../../../dev/dev-build-indicator/internal/initialize-for-new-overlay'
import { useIsDevRendering } from './internal/dev-render-indicator'
import { useDelayedRender } from '../../../hooks/use-delayed-render'

// TODO: add E2E tests to cover different scenarios

export function DevToolsIndicator({
  state,
  errorCount,
  setIsErrorOverlayOpen,
}: {
  state: OverlayState
  errorCount: number
  setIsErrorOverlayOpen: Dispatch<SetStateAction<boolean>>
}) {
  const [isDevToolsIndicatorOpen, setIsDevToolsIndicatorOpen] = useState(true)

  return (
    isDevToolsIndicatorOpen && (
      <DevToolsPopover
        semver={state.versionInfo.installed}
        issueCount={errorCount}
        isStaticRoute={state.staticIndicator}
        hide={() => {
          setIsDevToolsIndicatorOpen(false)
        }}
        setIsErrorOverlayOpen={setIsErrorOverlayOpen}
        isTurbopack={!!process.env.TURBOPACK}
      />
    )
  )
}

//////////////////////////////////////////////////////////////////////////////////////

const ANIMATE_OUT_DURATION_MS = 200
const ANIMATE_OUT_TIMING_FUNCTION = 'cubic-bezier(0.175, 0.885, 0.32, 1.1)'

interface C {
  closeMenu: () => void
  selectedIndex: number
  setSelectedIndex: Dispatch<SetStateAction<number>>
}

const Context = createContext({} as C)

function DevToolsPopover({
  issueCount,
  isStaticRoute,
  isTurbopack,
  hide,
  setIsErrorOverlayOpen,
}: {
  issueCount: number
  isStaticRoute: boolean
  semver: string | undefined
  isTurbopack: boolean
  hide: () => void
  setIsErrorOverlayOpen: Dispatch<SetStateAction<boolean>>
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  // This hook lets us do an exit animation before unmounting the component
  const { mounted, rendered } = useDelayedRender(isMenuOpen, {
    // Intentionally no fade in, makes the UI feel more immediate
    enterDelay: 0,
    // Graceful fade out to confirm that the UI did not break
    exitDelay: ANIMATE_OUT_DURATION_MS,
  })

  // Features to make the menu accessible
  useFocusTrap(menuRef, triggerRef, isMenuOpen)
  useClickOutside(menuRef, triggerRef, isMenuOpen, closeMenu)

  function select(index: number | 'first' | 'last') {
    if (index === 'first') {
      const all = menuRef.current?.querySelectorAll('[role="menuitem"]')
      if (all) {
        const firstIndex = all[0].getAttribute('data-index')
        select(Number(firstIndex))
      }
      return
    }

    if (index === 'last') {
      const all = menuRef.current?.querySelectorAll('[role="menuitem"]')
      if (all) {
        const lastIndex = all.length - 1
        select(lastIndex)
      }
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

  function onTriggerKeydown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (isMenuOpen) {
      return
    }

    // Open with first item focused
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      setIsMenuOpen(true)
      // Run on next tick because querying DOM after state change
      setTimeout(() => {
        select('first')
      })
    }

    // Open with last item focused
    if (e.key === 'ArrowUp') {
      setIsMenuOpen(true)
      // Run on next tick because querying DOM after state change
      setTimeout(() => {
        select('last')
      })
    }
  }

  function openErrorOverlay() {
    if (issueCount > 0) {
      setIsErrorOverlayOpen(true)
    }
  }

  function onTriggerClick() {
    setIsMenuOpen((prev) => !prev)
  }

  function closeMenu() {
    setIsMenuOpen(false)
    // Avoid flashing selected state
    setTimeout(() => {
      setSelectedIndex(-1)
    }, ANIMATE_OUT_DURATION_MS)
  }

  return (
    <Toast
      data-nextjs-toast
      style={{
        boxShadow: 'none',
        zIndex: 2147483647,
      }}
    >
      <NextLogo
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-controls="nextjs-dev-tools-menu"
        aria-label={`${isMenuOpen ? 'Close' : 'Open'} Next.js Dev Tools`}
        data-nextjs-dev-tools-button
        issueCount={issueCount}
        onTriggerClick={onTriggerClick}
        onKeyDown={onTriggerKeydown}
        openErrorOverlay={openErrorOverlay}
        isDevBuilding={useIsDevBuilding()}
        isDevRendering={useIsDevRendering()}
      />

      {mounted && (
        <div
          ref={menuRef}
          id="nextjs-dev-tools-menu"
          role="menu"
          dir="ltr"
          aria-orientation="vertical"
          aria-label="Next.js Dev Tools Items"
          tabIndex={-1}
          className="menu"
          onKeyDown={onMenuKeydown}
          data-rendered={rendered}
          style={
            {
              '--animate-out-duration-ms': `${ANIMATE_OUT_DURATION_MS}ms`,
              '--animate-out-timing-function': ANIMATE_OUT_TIMING_FUNCTION,
            } as React.CSSProperties
          }
        >
          <Context.Provider
            value={{
              closeMenu,
              selectedIndex,
              setSelectedIndex,
            }}
          >
            <div className="inner">
              {issueCount > 0 && (
                <MenuItem
                  index={0}
                  label="Issues"
                  value={<IssueCount>{issueCount}</IssueCount>}
                  onClick={openErrorOverlay}
                />
              )}
              <MenuItem
                label="Route"
                value={isStaticRoute ? 'Static' : 'Dynamic'}
                data-nextjs-route-type={isStaticRoute ? 'static' : 'dynamic'}
              />
              {isTurbopack ? (
                <MenuItem label="Turbopack" value="Enabled" />
              ) : (
                <MenuItem
                  index={1}
                  label="Try Turbopack"
                  value={<ExternalIcon />}
                  href="https://nextjs.org/docs/app/api-reference/turbopack"
                />
              )}
            </div>

            <div className="footer">
              <MenuItem
                data-hide-dev-tools
                label="Hide Dev Tools"
                value={<Cross color="var(--color-gray-900)" />}
                onClick={hide}
                index={isTurbopack ? 1 : 2}
              />
            </div>
          </Context.Provider>
        </div>
      )}
    </Toast>
  )
}

function MenuItem({
  index,
  label,
  value,
  onClick,
  href,
  ...props
}: {
  index?: number
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
      className="item"
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
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}

function IssueCount({ children }: { children: number }) {
  return (
    <span className="issueCount" data-has-issues={children > 0}>
      <span className="indicator" />
      {children}
    </span>
  )
}

//////////////////////////////////////////////////////////////////////////////////////

function useFocusTrap(
  menuRef: React.RefObject<HTMLDivElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  isMenuOpen: boolean
) {
  useEffect(() => {
    if (isMenuOpen) {
      menuRef.current?.focus()
    } else {
      const root = triggerRef.current?.getRootNode()
      const activeElement =
        root instanceof ShadowRoot ? (root?.activeElement as HTMLElement) : null

      // Only restore focus if the focus was previously on the menu.
      // This avoids us accidentally focusing on mount when the
      // user could want to interact with their own app instead.
      if (menuRef.current?.contains(activeElement)) {
        triggerRef.current?.focus()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMenuOpen])
}

//////////////////////////////////////////////////////////////////////////////////////

function useClickOutside(
  menuRef: React.RefObject<HTMLDivElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  isMenuOpen: boolean,
  closeMenu: () => void
) {
  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    // Close menu when clicking outside of it or its button
    const handleClickOutside = (event: MouseEvent) => {
      if (
        !(menuRef.current?.getBoundingClientRect()
          ? event.clientX >= menuRef.current.getBoundingClientRect()!.left &&
            event.clientX <= menuRef.current.getBoundingClientRect()!.right &&
            event.clientY >= menuRef.current.getBoundingClientRect()!.top &&
            event.clientY <= menuRef.current.getBoundingClientRect()!.bottom
          : false) &&
        !(triggerRef.current?.getBoundingClientRect()
          ? event.clientX >= triggerRef.current.getBoundingClientRect()!.left &&
            event.clientX <=
              triggerRef.current.getBoundingClientRect()!.right &&
            event.clientY >= triggerRef.current.getBoundingClientRect()!.top &&
            event.clientY <= triggerRef.current.getBoundingClientRect()!.bottom
          : false)
      ) {
        closeMenu()
      }
    }

    // Close popover when pressing escape
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMenuOpen])
}

//////////////////////////////////////////////////////////////////////////////////////

function ExternalIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      role="img"
      aria-label="External link"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.5 10.25V13.25C13.5 13.3881 13.3881 13.5 13.25 13.5H2.75C2.61193 13.5 2.5 13.3881 2.5 13.25L2.5 2.75C2.5 2.61193 2.61193 2.5 2.75 2.5H5.75H6.5V1H5.75H2.75C1.7835 1 1 1.7835 1 2.75V13.25C1 14.2165 1.7835 15 2.75 15H13.25C14.2165 15 15 14.2165 15 13.25V10.25V9.5H13.5V10.25ZM9 1H9.75H14.2495C14.6637 1 14.9995 1.33579 14.9995 1.75V6.25V7H13.4995V6.25V3.56066L8.53033 8.52978L8 9.06011L6.93934 7.99945L7.46967 7.46912L12.4388 2.5H9.75H9V1Z"
        fill="currentColor"
      />
    </svg>
  )
}
