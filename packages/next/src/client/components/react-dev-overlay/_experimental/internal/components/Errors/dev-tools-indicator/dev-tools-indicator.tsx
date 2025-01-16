import type { VersionInfo } from '../../../../../../../../server/dev/parse-version-info'
import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import { Toast } from '../../Toast'
import React, { useState, useEffect, useRef } from 'react'
import { NextLogo } from './internal/next-logo'
import { useIsDevBuilding } from '../../../../../../../dev/dev-build-indicator/internal/initialize-for-new-overlay'
import { useIsDevRendering } from './internal/dev-render-indicator'

// TODO: test a11y
// TODO: add E2E tests to cover different scenarios

export function DevToolsIndicator({
  versionInfo,
  hasStaticIndicator,
  readyErrors,
  fullscreen,
  hide,
  isTurbopack,
}: {
  versionInfo: VersionInfo | undefined
  readyErrors: ReadyRuntimeError[]
  fullscreen: () => void
  hide: () => void
  hasStaticIndicator?: boolean
  isTurbopack: boolean
}) {
  return (
    <DevToolsPopover
      semver={versionInfo?.installed}
      onIssuesClick={fullscreen}
      issueCount={readyErrors.length}
      isStaticRoute={hasStaticIndicator === true}
      hide={hide}
      isTurbopack={isTurbopack}
    />
  )
}

const DevToolsPopover = ({
  onIssuesClick,
  issueCount,
  isStaticRoute,
  hide,
  semver,
  isTurbopack,
}: {
  onIssuesClick: () => void
  issueCount: number
  isStaticRoute: boolean
  hide: () => void
  semver: string | undefined
  isTurbopack: boolean
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLDivElement>(null)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

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

  return (
    <Toast
      style={{
        boxShadow: 'none',
        zIndex: 2147483647,
      }}
    >
      <div ref={buttonRef}>
        <NextLogo
          issueCount={issueCount}
          onClick={togglePopover}
          isDevBuilding={useIsDevBuilding()}
          isDevRendering={useIsDevRendering()}
          aria-haspopup="true"
          aria-expanded={isPopoverOpen}
          aria-controls="dev-tools-popover"
          data-nextjs-dev-tools-button
        />
      </div>

      {isPopoverOpen && (
        <div
          ref={popoverRef}
          id="dev-tools-popover"
          role="dialog"
          aria-labelledby="dev-tools-title"
          data-nextjs-dev-tools-popover
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
                label="Route"
                value={isStaticRoute ? 'Static' : 'Dynamic'}
              />
              <IndicatorRow
                label="Issues"
                value={<IssueCount count={issueCount} />}
                onClick={issueCount > 0 ? onIssuesClick : undefined}
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
}: {
  label: string
  value: React.ReactNode
  onClick?: () => void
}) => {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper data-nextjs-dev-tools-row onClick={onClick}>
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
