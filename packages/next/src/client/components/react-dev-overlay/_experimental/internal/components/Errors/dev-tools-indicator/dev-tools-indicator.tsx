import type { VersionInfo } from '../../../../../../../../server/dev/parse-version-info'
import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import { Toast } from '../../Toast'
import React, { useState } from 'react'
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
  // TODO: close when clicking outside

  const isDevBuilding = useIsDevBuilding()
  const isDevRendering = useIsDevRendering()

  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const togglePopover = () => setIsPopoverOpen((prev) => !prev)
  return (
    <Toast style={{ boxShadow: 'none' }}>
      <NextLogo
        issueCount={issueCount}
        onClick={togglePopover}
        isDevBuilding={isDevBuilding}
        isDevRendering={isDevRendering}
        aria-haspopup="true"
        aria-expanded={isPopoverOpen}
        aria-controls="dev-tools-popover"
        data-nextjs-dev-tools-button
      />

      {isPopoverOpen && (
        <div
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
                value={
                  // TODO: replace with cmd+.for mac, ctrl+. for windows & implement hiding + unhiding logic
                  null
                }
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
  return (
    <div data-nextjs-dev-tools-row data-clickable={!!onClick} onClick={onClick}>
      <span data-nextjs-dev-tools-row-label>{label}</span>
      <span data-nextjs-dev-tools-row-value>{value}</span>
    </div>
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
