import type { Dispatch, SetStateAction } from 'react'
import type { OverlayState } from '../../../../../shared'

import { useState, useEffect, useRef } from 'react'
import { Toast } from '../../toast'
import { NextLogo } from './internal/next-logo'
import { useIsDevBuilding } from '../../../../../../../dev/dev-build-indicator/internal/initialize-for-new-overlay'
import { useIsDevRendering } from './internal/dev-render-indicator'
import { useDelayedRender } from './internal/use-delayed-render'
import { useKeyboardShortcut } from '../../../hooks/use-keyboard-shortcut'
import { MODIFIERS } from '../../../hooks/use-keyboard-shortcut'

// TODO: test a11y
// TODO: add E2E tests to cover different scenarios

export function DevToolsIndicator({
  state,
  readyErrorsLength,
  setIsErrorOverlayOpen,
}: {
  state: OverlayState
  readyErrorsLength: number
  setIsErrorOverlayOpen: Dispatch<SetStateAction<boolean>>
}) {
  const [isDevToolsIndicatorOpen, setIsDevToolsIndicatorOpen] = useState(true)
  // Register `(cmd|ctrl) + .` to show/hide the error indicator.
  useKeyboardShortcut({
    key: '.',
    modifiers: [MODIFIERS.CTRL_CMD],
    callback: () => {
      setIsDevToolsIndicatorOpen(!isDevToolsIndicatorOpen)
      setIsErrorOverlayOpen(!isDevToolsIndicatorOpen)
    },
  })

  return (
    isDevToolsIndicatorOpen && (
      <DevToolsPopover
        semver={state.versionInfo.installed}
        issueCount={readyErrorsLength}
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

const ANIMATE_OUT_DURATION_MS = 200
const ANIMATE_OUT_TIMING_FUNCTION = 'cubic-bezier(0.175, 0.885, 0.32, 1.1)'

const DevToolsPopover = ({
  issueCount,
  isStaticRoute,
  semver,
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
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLDivElement>(null)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

  const { mounted, rendered } = useDelayedRender(isPopoverOpen, {
    // Intentionally no fade in, makes the UI feel more immediate
    enterDelay: 0,
    // Graceful fade out to confirm that the UI did not break
    exitDelay: ANIMATE_OUT_DURATION_MS,
  })

  useEffect(() => {
    // Close popover when clicking outside of it or its button
    const handleClickOutside = (event: MouseEvent) => {
      if (
        !(popoverRef.current?.getBoundingClientRect()
          ? event.clientX >= popoverRef.current.getBoundingClientRect()!.left &&
            event.clientX <=
              popoverRef.current.getBoundingClientRect()!.right &&
            event.clientY >= popoverRef.current.getBoundingClientRect()!.top &&
            event.clientY <= popoverRef.current.getBoundingClientRect()!.bottom
          : false) &&
        !(buttonRef.current?.getBoundingClientRect()
          ? event.clientX >= buttonRef.current.getBoundingClientRect()!.left &&
            event.clientX <= buttonRef.current.getBoundingClientRect()!.right &&
            event.clientY >= buttonRef.current.getBoundingClientRect()!.top &&
            event.clientY <= buttonRef.current.getBoundingClientRect()!.bottom
          : false)
      ) {
        setIsPopoverOpen(false)
      }
    }

    // Close popover when pressing escape
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPopoverOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const togglePopover = () => setIsPopoverOpen((prev) => !prev)
  const onIssuesClick = () =>
    issueCount > 0 ? setIsErrorOverlayOpen(true) : null

  const onLogoClick = () => {
    togglePopover()
    onIssuesClick()
  }

  return (
    <Toast
      data-nextjs-toast
      style={{
        boxShadow: 'none',
        zIndex: 2147483647,
      }}
    >
      <div ref={buttonRef}>
        <NextLogo
          key={issueCount}
          issueCount={issueCount}
          onLogoClick={onLogoClick}
          onIssuesClick={onIssuesClick}
          isDevBuilding={useIsDevBuilding()}
          isDevRendering={useIsDevRendering()}
          aria-haspopup="true"
          aria-expanded={isPopoverOpen}
          aria-controls="dev-tools-popover"
          data-nextjs-dev-tools-button
        />
      </div>

      {mounted && (
        <div
          ref={popoverRef}
          id="dev-tools-popover"
          role="dialog"
          aria-labelledby="dev-tools-title"
          data-nextjs-dev-tools-popover
          data-rendered={rendered}
          style={
            {
              '--animate-out-duration-ms': `${ANIMATE_OUT_DURATION_MS}ms`,
              '--animate-out-timing-function': ANIMATE_OUT_TIMING_FUNCTION,
            } as React.CSSProperties
          }
          tabIndex={-1}
        >
          <div data-nextjs-dev-tools-content>
            <div data-nextjs-dev-tools-container>
              <h2 id="dev-tools-title" style={{ display: 'none' }}>
                Dev Tools Options
              </h2>

              <IndicatorRow
                label="Hide Dev Tools"
                value={<DevToolsShortcutGroup />}
                onClick={hide}
              />
              <IndicatorRow
                data-nextjs-route-type={isStaticRoute ? 'static' : 'dynamic'}
                label="Route"
                value={isStaticRoute ? 'Static' : 'Dynamic'}
              />
              <IndicatorRow
                label="Issues"
                value={<IssueCount count={issueCount} />}
                onClick={onIssuesClick}
              />
            </div>
          </div>
          <div data-nextjs-dev-tools-footer>
            <div data-nextjs-dev-tools-footer-text>
              {semver ? (
                <p data-nextjs-dev-tools-version>Next.js {semver}</p>
              ) : null}

              <p data-nextjs-dev-tools-version>
                Turbopack {isTurbopack ? 'enabled' : 'not enabled'}
              </p>
            </div>
          </div>
        </div>
      )}
    </Toast>
  )
}

const IndicatorRow = ({
  label,
  value,
  onClick,
  ...props
}: {
  label: string
  value: React.ReactNode
  onClick?: () => void
} & React.HTMLAttributes<HTMLDivElement | HTMLButtonElement>) => {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper data-nextjs-dev-tools-row onClick={onClick} {...props}>
      <span data-nextjs-dev-tools-row-label>{label}</span>
      <span data-nextjs-dev-tools-row-value>{value}</span>
    </Wrapper>
  )
}

const IssueCount = ({ count }: { count: number }) => {
  return (
    <span data-nextjs-dev-tools-issue-count data-has-issues={count > 0}>
      <span data-nextjs-dev-tools-issue-text data-has-issues={count > 0}>
        {count}
      </span>
    </span>
  )
}

function DevToolsShortcutGroup() {
  const isMac =
    // Feature detect for `navigator.userAgentData` which is experimental:
    // https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/platform
    'userAgentData' in navigator
      ? (navigator.userAgentData as any).platform === 'macOS'
      : // This is the least-bad option to detect the modifier key when using `navigator.platform`:
        // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/platform#examples
        navigator.platform.indexOf('Mac') === 0 ||
        navigator.platform === 'iPhone'

  return (
    <span data-nextjs-dev-tools-shortcut-group>
      {isMac ? <CmdIcon /> : <CtrlIcon />}
      <DotIcon />
    </span>
  )
}

function CmdIcon() {
  return <span data-nextjs-dev-tools-icon>⌘</span>
}

function CtrlIcon() {
  return (
    <span data-nextjs-dev-tools-icon data-nextjs-dev-tools-ctrl-icon>
      ctrl
    </span>
  )
}

function DotIcon() {
  return <span data-nextjs-dev-tools-icon>.</span>
}
