import type { Dispatch, SetStateAction } from 'react'
import type { OverlayState } from '../../../../../shared'

import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Toast } from '../../toast'
import { NextLogo } from './internal/next-logo'
import { useIsDevBuilding } from '../../../../../../../dev/dev-build-indicator/internal/initialize-for-new-overlay'
import { useIsDevRendering } from './internal/dev-render-indicator'
import { useDelayedRender } from '../../../hooks/use-delayed-render'
import { noop as css } from '../../../helpers/noop-template'
import { TurbopackInfo } from './dev-tools-info/turbopack-info'
import { RouteInfo } from './dev-tools-info/route-info'
import { StopIcon } from '../../../icons/stop-icon'

// TODO: add E2E tests to cover different scenarios

const INDICATOR_POSITION =
  (process.env
    .__NEXT_DEV_INDICATOR_POSITION as typeof window.__NEXT_DEV_INDICATOR_POSITION) ||
  'bottom-left'

type DevToolsIndicatorPosition = typeof INDICATOR_POSITION

export function DevToolsIndicator({
  state,
  errorCount,
  isBuildError,
  setIsErrorOverlayOpen,
  position = INDICATOR_POSITION,
}: {
  state: OverlayState
  errorCount: number
  isBuildError: boolean
  setIsErrorOverlayOpen: Dispatch<SetStateAction<boolean>>
  // Technically this prop isn't needed, but useful for testing.
  position?: DevToolsIndicatorPosition
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
        position={position}
        disabled={state.disableDevIndicator}
        isBuildError={isBuildError}
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
  disabled,
  issueCount,
  isStaticRoute,
  isTurbopack,
  position,
  isBuildError,
  hide,
  setIsErrorOverlayOpen,
}: {
  disabled: boolean
  issueCount: number
  isStaticRoute: boolean
  semver: string | undefined
  isTurbopack: boolean
  position: DevToolsIndicatorPosition
  isBuildError: boolean
  hide: () => void
  setIsErrorOverlayOpen: Dispatch<SetStateAction<boolean>>
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const turbopackRef = useRef<HTMLElement>(null)
  const triggerTurbopackRef = useRef<HTMLButtonElement | null>(null)
  const routeInfoRef = useRef<HTMLElement>(null)
  const triggerRouteInfoRef = useRef<HTMLButtonElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isTurbopackInfoOpen, setIsTurbopackInfoOpen] = useState(false)
  const [isRouteInfoOpen, setIsRouteInfoOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  // This hook lets us do an exit animation before unmounting the component
  const { mounted: menuMounted, rendered: menuRendered } = useDelayedRender(
    isMenuOpen,
    {
      // Intentionally no fade in, makes the UI feel more immediate
      enterDelay: 0,
      // Graceful fade out to confirm that the UI did not break
      exitDelay: ANIMATE_OUT_DURATION_MS,
    }
  )
  const { mounted: turbopackInfoMounted, rendered: turbopackInfoRendered } =
    useDelayedRender(isTurbopackInfoOpen, {
      enterDelay: 0,
      exitDelay: ANIMATE_OUT_DURATION_MS,
    })
  const { mounted: routeInfoMounted, rendered: routeInfoRendered } =
    useDelayedRender(isRouteInfoOpen, {
      enterDelay: 0,
      exitDelay: ANIMATE_OUT_DURATION_MS,
    })

  // Features to make the menu accessible
  useFocusTrap(menuRef, triggerRef, isMenuOpen)
  useClickOutside(menuRef, triggerRef, isMenuOpen, closeMenu)
  useFocusTrap(turbopackRef, triggerTurbopackRef, isTurbopackInfoOpen)
  useClickOutside(
    turbopackRef,
    triggerTurbopackRef,
    isTurbopackInfoOpen,
    closeTurbopackInfo
  )
  useFocusTrap(routeInfoRef, triggerRouteInfoRef, isRouteInfoOpen)
  useClickOutside(
    routeInfoRef,
    triggerRouteInfoRef,
    isRouteInfoOpen,
    closeRouteInfo
  )

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

  function closeTurbopackInfo() {
    setIsTurbopackInfoOpen(false)
  }

  function closeRouteInfo() {
    setIsRouteInfoOpen(false)
  }

  const [vertical, horizontal] = position.split('-', 2)

  return (
    <Toast
      data-nextjs-toast
      style={{
        boxShadow: 'none',
        zIndex: 2147483647,
        // Reset the toast component's default positions.
        bottom: 'initial',
        left: 'initial',
        [vertical]: 'var(--size-2_5)',
        [horizontal]: 'var(--size-5)',
      }}
    >
      <NextLogo
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-controls="nextjs-dev-tools-menu"
        aria-label={`${isMenuOpen ? 'Close' : 'Open'} Next.js Dev Tools`}
        data-nextjs-dev-tools-button
        disabled={disabled}
        issueCount={issueCount}
        onTriggerClick={onTriggerClick}
        onKeyDown={onTriggerKeydown}
        openErrorOverlay={openErrorOverlay}
        isDevBuilding={useIsDevBuilding()}
        isDevRendering={useIsDevRendering()}
        isBuildError={isBuildError}
      />

      {routeInfoMounted && (
        <RouteInfo
          ref={routeInfoRef}
          routeType={isStaticRoute ? 'Static' : 'Dynamic'}
          isOpen={isRouteInfoOpen}
          setIsOpen={setIsRouteInfoOpen}
          setPreviousOpen={setIsMenuOpen}
          style={{
            [vertical]: 'calc(100% + var(--size-gap))',
            [horizontal]: 0,
          }}
          data-rendered={routeInfoRendered}
        />
      )}

      {turbopackInfoMounted && (
        <TurbopackInfo
          ref={turbopackRef}
          isOpen={isTurbopackInfoOpen}
          setIsOpen={setIsTurbopackInfoOpen}
          setPreviousOpen={setIsMenuOpen}
          style={{
            [vertical]: 'calc(100% + var(--size-gap))',
            [horizontal]: 0,
          }}
          data-rendered={turbopackInfoRendered}
        />
      )}

      {menuMounted && (
        <div
          ref={menuRef}
          id="nextjs-dev-tools-menu"
          role="menu"
          dir="ltr"
          aria-orientation="vertical"
          aria-label="Next.js Dev Tools Items"
          tabIndex={-1}
          className="dev-tools-indicator-menu"
          onKeyDown={onMenuKeydown}
          data-rendered={menuRendered}
          style={
            {
              '--animate-out-duration-ms': `${ANIMATE_OUT_DURATION_MS}ms`,
              '--animate-out-timing-function': ANIMATE_OUT_TIMING_FUNCTION,
              [vertical]: 'calc(100% + var(--size-gap))',
              [horizontal]: 0,
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
            <div className="dev-tools-indicator-inner">
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
                index={1}
                value={isStaticRoute ? 'Static' : 'Dynamic'}
                onClick={() => setIsRouteInfoOpen(true)}
                data-nextjs-route-type={isStaticRoute ? 'static' : 'dynamic'}
              />
              {isTurbopack ? (
                <MenuItem label="Turbopack" value="Enabled" />
              ) : (
                <MenuItem
                  index={2}
                  label="Try Turbopack"
                  value={<ChevronRight />}
                  onClick={() => setIsTurbopackInfoOpen(true)}
                />
              )}
            </div>

            <div className="dev-tools-indicator-footer">
              <MenuItem
                data-hide-dev-tools
                label="Hide Dev Tools"
                value={<StopIcon />}
                onClick={hide}
                index={isTurbopack ? 2 : 3}
              />
            </div>
          </Context.Provider>
        </div>
      )}
    </Toast>
  )
}

function ChevronRight() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none">
      <path
        fill="#666"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.50011 1.93945L6.03044 2.46978L10.8537 7.293C11.2442 7.68353 11.2442 8.31669 10.8537 8.70722L6.03044 13.5304L5.50011 14.0608L4.43945 13.0001L4.96978 12.4698L9.43945 8.00011L4.96978 3.53044L4.43945 3.00011L5.50011 1.93945Z"
      />
    </svg>
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

function IssueCount({ children }: { children: number }) {
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

//////////////////////////////////////////////////////////////////////////////////////

function useFocusTrap(
  menuRef: React.RefObject<HTMLElement | null>,
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
  menuRef: React.RefObject<HTMLElement | null>,
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

export const DEV_TOOLS_INDICATOR_STYLES = css`
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

  .dev-tools-indicator-inner {
    padding: 6px;
    width: 100%;
  }

  .dev-tools-indicator-item {
    display: flex;
    align-items: center;
    padding: 8px 6px;
    height: 36px;
    border-radius: 6px;
    text-decoration: none !important;
    user-select: none;

    &:focus-visible {
      outline: 0;
    }
  }

  .dev-tools-indicator-footer {
    background: var(--color-background-200);
    padding: 6px;
    border-top: 1px solid var(--color-gray-400);
    width: 100%;
  }

  .dev-tools-indicator-item[data-selected='true'] {
    cursor: pointer;
    background-color: var(--color-gray-200);
  }

  .dev-tools-indicator-label {
    font-size: var(--size-font-small);
    line-height: var(--size-5);
    color: var(--color-gray-1000);
  }

  .dev-tools-indicator-value {
    font-size: var(--size-font-small);
    line-height: var(--size-5);
    color: var(--color-gray-900);
    margin-left: auto;
  }

  .dev-tools-indicator-issue-count {
    --color-primary: var(--color-gray-800);
    --color-secondary: var(--color-gray-100);
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 41px;
    height: 24px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-400);
    background-clip: padding-box;
    box-shadow: var(--shadow-small);
    padding: 2px;
    color: var(--color-gray-1000);
    border-radius: 128px;
    font-weight: 500;
    font-size: 13px;
    font-variant-numeric: tabular-nums;

    &[data-has-issues='true'] {
      --color-primary: var(--color-red-800);
      --color-secondary: var(--color-red-100);
    }

    .dev-tools-indicator-issue-count-indicator {
      width: 8px;
      height: 8px;
      background: var(--color-primary);
      box-shadow: 0 0 0 2px var(--color-secondary);
      border-radius: 50%;
    }
  }

  .dev-tools-indicator-shortcut {
    display: flex;
    gap: var(--size-1);

    kbd {
      width: var(--size-5);
      height: var(--size-5);
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: var(--rounded-md);
      border: 1px solid var(--color-gray-400);
      font-family: var(--font-stack-sans);
      background: var(--color-background-100);
      color: var(--color-gray-1000);
      text-align: center;
      font-size: var(--size-font-smaller);
      line-height: var(--size-4);
    }
  }
`
