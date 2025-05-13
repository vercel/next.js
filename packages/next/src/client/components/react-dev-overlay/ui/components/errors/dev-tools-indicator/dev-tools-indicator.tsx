import type { CSSProperties } from 'react'
import { STORAGE_KEY_POSITION, type OverlayState } from '../../../../shared'

import { useState, useRef } from 'react'
import { Toast } from '../../toast'
import { NextLogo } from './next-logo'
import { useIsDevBuilding } from '../../../../../../dev/dev-build-indicator/internal/initialize'
import { useIsDevRendering } from '../../../../utils/dev-indicator/dev-render-indicator'
import { useDelayedRender } from '../../../hooks/use-delayed-render'
import { TurbopackInfo } from './dev-tools-info/turbopack-info'
import { RouteInfo } from './dev-tools-info/route-info'
import GearIcon from '../../../icons/gear-icon'
import { UserPreferences } from './dev-tools-info/user-preferences'
import { MENU_CURVE, MENU_DURATION_MS } from './utils'
import {
  getInitialPosition,
  type DevToolsScale,
} from './dev-tools-info/preferences'
import { Draggable } from './draggable'
import { Menu, MenuItem } from './menu'

// TODO: add E2E tests to cover different scenarios

export function DevToolsIndicator({
  state,
  errorCount,
  isBuildError,
  setIsErrorOverlayOpen,
  ...props
}: {
  state: OverlayState
  errorCount: number
  isBuildError: boolean
  setIsErrorOverlayOpen: (
    isErrorOverlayOpen: boolean | ((prev: boolean) => boolean)
  ) => void
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
      isStaticRoute={state.staticIndicator}
      hide={() => {
        setIsDevToolsIndicatorVisible(false)
        fetch('/__nextjs_disable_dev_indicator', {
          method: 'POST',
        })
      }}
      setIsErrorOverlayOpen={setIsErrorOverlayOpen}
      isTurbopack={!!process.env.TURBOPACK}
      disabled={state.disableDevIndicator || !isDevToolsIndicatorVisible}
      isBuildError={isBuildError}
      {...props}
    />
  )
}

//////////////////////////////////////////////////////////////////////////////////////

const OVERLAYS = {
  Root: 'root',
  Turbo: 'turbo',
  Route: 'route',
  ResetDev: 'resetDev',
  Preferences: 'preferences',
} as const

export type Overlays = (typeof OVERLAYS)[keyof typeof OVERLAYS]

const INDICATOR_PADDING = 20

function DevToolsPopover({
  routerType,
  disabled,
  issueCount,
  isStaticRoute,
  isTurbopack,
  isBuildError,
  hide,
  setIsErrorOverlayOpen,
  scale,
  setScale,
}: {
  routerType: 'pages' | 'app'
  disabled: boolean
  issueCount: number
  isStaticRoute: boolean
  semver: string | undefined
  isTurbopack: boolean
  isBuildError: boolean
  hide: () => void
  setIsErrorOverlayOpen: (
    isOverlayOpen: boolean | ((prev: boolean) => boolean)
  ) => void
  scale: DevToolsScale
  setScale: (value: DevToolsScale) => void
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const [open, setOpen] = useState<Overlays | null>(null)
  const [position, setPosition] = useState(getInitialPosition())

  const isMenuOpen = open === OVERLAYS.Root
  const isTurbopackInfoOpen = open === OVERLAYS.Turbo
  const isRouteInfoOpen = open === OVERLAYS.Route
  const isPreferencesOpen = open === OVERLAYS.Preferences

  const { mounted: menuMounted, rendered: menuRendered } = useDelayedRender(
    isMenuOpen,
    {
      // Intentionally no fade in, makes the UI feel more immediate
      enterDelay: 0,
      // Graceful fade out to confirm that the UI did not break
      exitDelay: MENU_DURATION_MS,
    }
  )

  function openErrorOverlay() {
    setOpen(null)
    if (issueCount > 0) {
      setIsErrorOverlayOpen(true)
    }
  }

  function toggleErrorOverlay() {
    setIsErrorOverlayOpen((prev) => !prev)
  }

  function openRootMenu() {
    setOpen(OVERLAYS.Root)
  }

  function onTriggerClick() {
    setOpen((prevOpen) => {
      if (prevOpen === OVERLAYS.Root) {
        return null
      } else {
        return OVERLAYS.Root
      }
    })
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
          isDevBuilding={useIsDevBuilding()}
          isDevRendering={useIsDevRendering()}
          isBuildError={isBuildError}
          scale={scale}
        />
      </Draggable>

      {/* Route Info */}
      <RouteInfo
        isOpen={isRouteInfoOpen}
        close={openRootMenu}
        triggerRef={triggerRef}
        style={popover}
        routerType={routerType}
        routeType={isStaticRoute ? 'Static' : 'Dynamic'}
      />

      {/* Turbopack Info */}
      <TurbopackInfo
        isOpen={isTurbopackInfoOpen}
        close={openRootMenu}
        triggerRef={triggerRef}
        style={popover}
      />

      {/* Preferences */}
      <UserPreferences
        isOpen={isPreferencesOpen}
        close={openRootMenu}
        triggerRef={triggerRef}
        style={popover}
        hide={handleHideDevtools}
        setPosition={setPosition}
        position={position}
        scale={scale}
        setScale={setScale}
      />

      {/* Dropdown Menu */}
      {menuMounted && (
        <Menu
          aria-label="Next.js Dev Tools Items"
          close={closeMenu}
          isOpen={menuRendered}
          style={popover}
          triggerRef={triggerRef}
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
          </div>
        </Menu>
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
  .dev-tools-indicator-inner {
    padding: 6px;
    width: 100%;
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
