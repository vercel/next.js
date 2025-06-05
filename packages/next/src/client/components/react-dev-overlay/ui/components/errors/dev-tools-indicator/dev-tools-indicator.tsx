import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import {
  ACTION_ERROR_OVERLAY_OPEN,
  ACTION_ERROR_OVERLAY_TOGGLE,
  STORAGE_KEY_POSITION,
  type OverlayDispatch,
  type OverlayState,
} from '../../../../shared'

import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Toast } from '../../toast'
import { NextLogo } from './next-logo'
import { useIsDevRendering } from '../../../../utils/dev-indicator/dev-render-indicator'
import { useDelayedRender } from '../../../hooks/use-delayed-render'
import { TurbopackInfo } from './dev-tools-info/turbopack-info'
import { RouteInfo } from './dev-tools-info/route-info'
import GearIcon from '../../../icons/gear-icon'
import { UserPreferences } from './dev-tools-info/user-preferences'
import { SegmentsExplorer } from '../../overview/segment-explorer'
import {
  MENU_CURVE,
  MENU_DURATION_MS,
  useClickOutside,
  useFocusTrap,
} from './utils'
import {
  getInitialPosition,
  type DevToolsScale,
} from './dev-tools-info/preferences'
import { Draggable } from './draggable'

// TODO: add E2E tests to cover different scenarios

export function DevToolsIndicator({
  state,
  errorCount,
  isBuildError,
  ...props
}: {
  state: OverlayState
  dispatch: OverlayDispatch
  errorCount: number
  isBuildError: boolean

  scale: DevToolsScale
  setScale: (value: DevToolsScale) => void
}) {
  const [isDevToolsIndicatorVisible, setIsDevToolsIndicatorVisible] =
    useState(true)

  return (
    <DevToolsPopover
      routerType={state.routerType}
      semver={state.versionInfo.installed}
      issueCount={errorCount}
      isDevBuilding={state.buildingIndicator}
      isStaticRoute={state.staticIndicator}
      hide={() => {
        setIsDevToolsIndicatorVisible(false)
        fetch('/__nextjs_disable_dev_indicator', {
          method: 'POST',
        })
      }}
      isTurbopack={!!process.env.TURBOPACK}
      disabled={state.disableDevIndicator || !isDevToolsIndicatorVisible}
      isBuildError={isBuildError}
      {...props}
    />
  )
}

//////////////////////////////////////////////////////////////////////////////////////

interface C {
  closeMenu: () => void
  selectedIndex: number
  setSelectedIndex: Dispatch<SetStateAction<number>>
}

const Context = createContext({} as C)

const OVERLAYS = {
  Root: 'root',
  Turbo: 'turbo',
  Route: 'route',
  Preferences: 'preferences',
  SegmentExplorer: 'segment-explorer',
} as const

export type Overlays = (typeof OVERLAYS)[keyof typeof OVERLAYS]

const INDICATOR_PADDING = 20

function DevToolsPopover({
  routerType,
  disabled,
  issueCount,
  isDevBuilding,
  isStaticRoute,
  isTurbopack,
  isBuildError,
  hide,
  dispatch,
  scale,
  setScale,
}: {
  routerType: 'pages' | 'app'
  disabled: boolean
  issueCount: number
  isStaticRoute: boolean
  semver: string | undefined
  isDevBuilding: boolean
  isTurbopack: boolean
  isBuildError: boolean
  hide: () => void
  dispatch: OverlayDispatch
  scale: DevToolsScale
  setScale: (value: DevToolsScale) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const [open, setOpen] = useState<Overlays | null>(null)
  const [position, setPosition] = useState(getInitialPosition())
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const isMenuOpen = open === OVERLAYS.Root
  const isTurbopackInfoOpen = open === OVERLAYS.Turbo
  const isRouteInfoOpen = open === OVERLAYS.Route
  const isPreferencesOpen = open === OVERLAYS.Preferences
  const isSegmentExplorerOpen = open === OVERLAYS.SegmentExplorer

  const { mounted: menuMounted, rendered: menuRendered } = useDelayedRender(
    isMenuOpen,
    {
      // Intentionally no fade in, makes the UI feel more immediate
      enterDelay: 0,
      // Graceful fade out to confirm that the UI did not break
      exitDelay: MENU_DURATION_MS,
    }
  )

  // Features to make the menu accessible
  useFocusTrap(menuRef, triggerRef, isMenuOpen)
  useClickOutside(menuRef, triggerRef, isMenuOpen, closeMenu)

  useEffect(() => {
    if (open === null) {
      // Avoid flashing selected state
      const id = setTimeout(() => {
        setSelectedIndex(-1)
      }, MENU_DURATION_MS)
      return () => clearTimeout(id)
    }
  }, [open])

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

  function openErrorOverlay() {
    setOpen(null)
    if (issueCount > 0) {
      dispatch({ type: ACTION_ERROR_OVERLAY_OPEN })
    }
  }

  function toggleErrorOverlay() {
    dispatch({ type: ACTION_ERROR_OVERLAY_TOGGLE })
  }

  function closeToRootMenu() {
    setOpen(OVERLAYS.Root)
    // We wait for the menu animation to complete
    setTimeout(() => {
      // This places focus again on the selected item
      // so you can press Enter to trigger the selected item again
      select(selectedIndex)
    }, MENU_DURATION_MS)
  }

  function onTriggerClick() {
    if (open === OVERLAYS.Root) {
      setOpen(null)
    } else {
      setOpen(OVERLAYS.Root)
      setTimeout(() => {
        select('first')
      })
    }
  }

  function closeMenu() {
    // Only close when we were on `Root`,
    // otherwise it will close other overlays
    setOpen((prevOpen) => {
      if (prevOpen === OVERLAYS.Root) {
        return null
      }
      return prevOpen
    })
  }

  function handleHideDevtools() {
    setOpen(null)
    hide()
  }

  const [vertical, horizontal] = position.split('-', 2)
  const popover = { [vertical]: 'calc(100% + 8px)', [horizontal]: 0 }

  return (
    <Toast
      data-nextjs-toast
      style={
        {
          '--animate-out-duration-ms': `${MENU_DURATION_MS}ms`,
          '--animate-out-timing-function': MENU_CURVE,
          boxShadow: 'none',
          zIndex: 2147483647,
          [vertical]: `${INDICATOR_PADDING}px`,
          [horizontal]: `${INDICATOR_PADDING}px`,
        } as CSSProperties
      }
    >
      <Draggable
        padding={INDICATOR_PADDING}
        onDragStart={() => setOpen(null)}
        position={position}
        setPosition={(p) => {
          localStorage.setItem(STORAGE_KEY_POSITION, p)
          setPosition(p)
        }}
      >
        {/* Trigger */}
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
          toggleErrorOverlay={toggleErrorOverlay}
          isDevBuilding={isDevBuilding}
          isDevRendering={useIsDevRendering()}
          isBuildError={isBuildError}
          scale={scale}
        />
      </Draggable>

      {/* Route Info */}
      <RouteInfo
        isOpen={isRouteInfoOpen}
        close={closeToRootMenu}
        triggerRef={triggerRef}
        style={popover}
        routerType={routerType}
        routeType={isStaticRoute ? 'Static' : 'Dynamic'}
      />

      {/* Turbopack Info */}
      <TurbopackInfo
        isOpen={isTurbopackInfoOpen}
        close={closeToRootMenu}
        triggerRef={triggerRef}
        style={popover}
      />

      {/* Preferences */}
      <UserPreferences
        isOpen={isPreferencesOpen}
        close={closeToRootMenu}
        triggerRef={triggerRef}
        style={popover}
        hide={handleHideDevtools}
        setPosition={setPosition}
        position={position}
        scale={scale}
        setScale={setScale}
      />

      {/* Page Segment Explorer */}
      {process.env.__NEXT_DEVTOOL_SEGMENT_EXPLORER ? (
        <SegmentsExplorer
          isOpen={isSegmentExplorerOpen}
          close={closeToRootMenu}
          triggerRef={triggerRef}
          style={popover}
        />
      ) : null}

      {/* Dropdown Menu */}
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
          style={popover}
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
                  title={`${issueCount} ${issueCount === 1 ? 'issue' : 'issues'} found. Click to view details in the dev overlay.`}
                  index={0}
                  label="Issues"
                  value={<IssueCount>{issueCount}</IssueCount>}
                  onClick={openErrorOverlay}
                />
              )}
              <MenuItem
                title={`Current route is ${isStaticRoute ? 'static' : 'dynamic'}.`}
                label="Route"
                index={1}
                value={isStaticRoute ? 'Static' : 'Dynamic'}
                onClick={() => setOpen(OVERLAYS.Route)}
                data-nextjs-route-type={isStaticRoute ? 'static' : 'dynamic'}
              />
              {isTurbopack ? (
                <MenuItem
                  title="Turbopack is enabled."
                  label="Turbopack"
                  value="Enabled"
                />
              ) : (
                <MenuItem
                  index={2}
                  title="Learn about Turbopack and how to enable it in your application."
                  label="Try Turbopack"
                  value={<ChevronRight />}
                  onClick={() => setOpen(OVERLAYS.Turbo)}
                />
              )}
            </div>

            <div className="dev-tools-indicator-footer">
              <MenuItem
                data-preferences
                label="Preferences"
                value={<GearIcon />}
                onClick={() => setOpen(OVERLAYS.Preferences)}
                index={isTurbopack ? 2 : 3}
              />
              {process.env.__NEXT_DEVTOOL_SEGMENT_EXPLORER ? (
                <MenuItem
                  data-segment-explorer
                  label="Segment Explorer"
                  value={<ChevronRight />}
                  onClick={() => setOpen(OVERLAYS.SegmentExplorer)}
                  index={isTurbopack ? 3 : 4}
                />
              ) : null}
            </div>
          </Context.Provider>
        </div>
      )}
    </Toast>
  )
}

function ChevronRight() {
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

export const DEV_TOOLS_INDICATOR_STYLES = `
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
    font-size: var(--size-14);
    line-height: var(--size-20);
    color: var(--color-gray-1000);
  }

  .dev-tools-indicator-value {
    font-size: var(--size-14);
    line-height: var(--size-20);
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
    min-width: var(--size-40);
    height: var(--size-24);
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-400);
    background-clip: padding-box;
    box-shadow: var(--shadow-small);
    padding: 2px;
    color: var(--color-gray-1000);
    border-radius: 128px;
    font-weight: 500;
    font-size: var(--size-13);
    font-variant-numeric: tabular-nums;

    &[data-has-issues='true'] {
      --color-primary: var(--color-red-800);
      --color-secondary: var(--color-red-100);
    }

    .dev-tools-indicator-issue-count-indicator {
      width: var(--size-8);
      height: var(--size-8);
      background: var(--color-primary);
      box-shadow: 0 0 0 2px var(--color-secondary);
      border-radius: 50%;
    }
  }

  .dev-tools-indicator-shortcut {
    display: flex;
    gap: 4px;

    kbd {
      width: var(--size-20);
      height: var(--size-20);
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: var(--rounded-md);
      border: 1px solid var(--color-gray-400);
      font-family: var(--font-stack-sans);
      background: var(--color-background-100);
      color: var(--color-gray-1000);
      text-align: center;
      font-size: var(--size-12);
      line-height: var(--size-16);
    }
  }

  .dev-tools-grabbing {
    cursor: grabbing;

    > * {
      pointer-events: none;
    }
  }
`
