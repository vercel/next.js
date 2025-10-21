import { useRef, useState } from 'react'
import { useUpdateAnimation } from './hooks/use-update-animation'
import { useMeasureWidth } from './hooks/use-measure-width'
import { Cross } from '../../icons/cross'
import { Warning } from '../../icons/warning'
import { css } from '../../utils/css'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { useRenderErrorContext } from '../../dev-overlay'
import { useDelayedRender } from '../../hooks/use-delayed-render'
import {
  ACTION_ERROR_OVERLAY_CLOSE,
  ACTION_ERROR_OVERLAY_OPEN,
} from '../../shared'
import { usePanelRouterContext } from '../../menu/context'
import { BASE_LOGO_SIZE } from '../../utils/indicator-metrics'
import { StatusIndicator, Status, getCurrentStatus } from './status-indicator'

const SHORT_DURATION_MS = 150

export function NextLogo({
  onTriggerClick,
  ...buttonProps
}: { onTriggerClick: () => void } & React.ComponentProps<'button'>) {
  const { state, dispatch } = useDevOverlayContext()
  const { totalErrorCount } = useRenderErrorContext()
  const SIZE = BASE_LOGO_SIZE / state.scale
  const { panel, triggerRef, setPanel } = usePanelRouterContext()
  const isMenuOpen = panel === 'panel-selector'

  const hasError = totalErrorCount > 0
  const [isErrorExpanded, setIsErrorExpanded] = useState(hasError)
  const [previousHasError, setPreviousHasError] = useState(hasError)
  if (previousHasError !== hasError) {
    setPreviousHasError(hasError)
    // Reset the expanded state when the error state changes
    setIsErrorExpanded(hasError)
  }
  const [dismissed, setDismissed] = useState(false)
  const newErrorDetected = useUpdateAnimation(
    totalErrorCount,
    SHORT_DURATION_MS
  )

  // Cache indicator state management
  const isCacheFilling = state.cacheIndicator === 'filling'
  const isCacheBypassing = state.cacheIndicator === 'bypass'

  // Determine if we should show any status
  const shouldShowStatus =
    state.buildingIndicator ||
    state.renderingIndicator ||
    isCacheFilling ||
    (isCacheBypassing && state.renderingIndicator)

  // Delay showing for 400ms to catch fast operations,
  // and keep visible for minimum time (longer for warnings)
  const { rendered: showStatusIndicator } = useDelayedRender(shouldShowStatus, {
    enterDelay: isCacheBypassing && state.renderingIndicator ? 0 : 400, // Bypass warning shows immediately, others delayed
    exitDelay: 500,
  })

  const ref = useRef<HTMLDivElement | null>(null)
  const measuredWidth = useMeasureWidth(ref)

  // Get the current status from the state
  const currentStatus = getCurrentStatus(
    state.buildingIndicator,
    state.renderingIndicator,
    state.cacheIndicator
  )

  const displayStatus = showStatusIndicator ? currentStatus : Status.None

  const isExpanded =
    isErrorExpanded || showStatusIndicator || state.disableDevIndicator
  const width = measuredWidth === 0 ? 'auto' : measuredWidth

  return (
    <div
      data-next-badge-root
      style={
        {
          '--size': `${SIZE}px`,
          '--duration-short': `${SHORT_DURATION_MS}ms`,
          // if the indicator is disabled, hide the badge
          // also allow the "disabled" state be dismissed, as long as there are no build errors
          display:
            state.disableDevIndicator && (!hasError || dismissed)
              ? 'none'
              : 'block',
        } as React.CSSProperties
      }
    >
      {/* Styles */}
      <style>
        {css`
          [data-next-badge-root] {
            --timing: cubic-bezier(0.23, 0.88, 0.26, 0.92);
            --duration-long: 250ms;
            --color-outer-border: #171717;
            --color-inner-border: hsla(0, 0%, 100%, 0.14);
            --color-hover-alpha-subtle: hsla(0, 0%, 100%, 0.13);
            --color-hover-alpha-error: hsla(0, 0%, 100%, 0.2);
            --color-hover-alpha-error-2: hsla(0, 0%, 100%, 0.25);
            --mark-size: calc(var(--size) - var(--size-2) * 2);

            --focus-color: var(--color-blue-800);
            --focus-ring: 2px solid var(--focus-color);

            &:has([data-next-badge][data-error='true']) {
              --focus-color: #fff;
            }
          }

          [data-disabled-icon] {
            display: flex;
            align-items: center;
            justify-content: center;
            padding-right: 4px;
          }

          [data-next-badge] {
            width: var(--size);
            height: var(--size);
            display: flex;
            align-items: center;
            position: relative;
            background: rgba(0, 0, 0, 0.8);
            box-shadow:
              0 0 0 1px var(--color-outer-border),
              inset 0 0 0 1px var(--color-inner-border),
              0px 16px 32px -8px rgba(0, 0, 0, 0.24);
            backdrop-filter: blur(48px);
            border-radius: var(--rounded-full);
            user-select: none;
            cursor: pointer;
            scale: 1;
            overflow: hidden;
            will-change: scale, box-shadow, width, background;
            transition:
              scale var(--duration-short) var(--timing),
              width var(--duration-long) var(--timing),
              box-shadow var(--duration-long) var(--timing),
              background var(--duration-short) ease;

            &:active[data-error='false'] {
              scale: 0.95;
            }

            &[data-animate='true']:not(:hover) {
              scale: 1.02;
            }

            &[data-error='false']:has([data-next-mark]:focus-visible) {
              outline: var(--focus-ring);
              outline-offset: 3px;
            }

            &[data-error='true'] {
              background: #ca2a30;
              --color-inner-border: #e5484d;

              [data-next-mark] {
                background: var(--color-hover-alpha-error);
                outline-offset: 0px;

                &:focus-visible {
                  outline: var(--focus-ring);
                  outline-offset: -1px;
                }

                &:hover {
                  background: var(--color-hover-alpha-error-2);
                }
              }
            }

            &[data-status='cache-bypassing'] {
              background: rgba(251, 211, 141, 0.95); /* Warm amber background */
              --color-inner-border: rgba(245, 158, 11, 0.8);

              [data-indicator-status] {
                color: rgba(92, 45, 10, 1); /* Dark brown text */
              }
            }

            &[data-error-expanded='false'][data-error='true'] ~ [data-dot] {
              scale: 1;
            }

            > div {
              display: flex;
            }
          }

          [data-issues-collapse]:focus-visible {
            outline: var(--focus-ring);
          }

          [data-issues]:has([data-issues-open]:focus-visible) {
            outline: var(--focus-ring);
            outline-offset: -1px;
          }

          [data-dot] {
            content: '';
            width: var(--size-8);
            height: var(--size-8);
            background: #fff;
            box-shadow: 0 0 0 1px var(--color-outer-border);
            border-radius: 50%;
            position: absolute;
            top: 2px;
            right: 0px;
            scale: 0;
            pointer-events: none;
            transition: scale 200ms var(--timing);
            transition-delay: var(--duration-short);
          }

          [data-issues] {
            --padding-left: 8px;
            display: flex;
            gap: 2px;
            align-items: center;
            padding-left: 8px;
            padding-right: 8px;
            height: var(--size-32);
            margin-right: 2px;
            border-radius: var(--rounded-full);
            transition: background var(--duration-short) ease;

            &:has([data-issues-open]:hover) {
              background: var(--color-hover-alpha-error);
            }

            &:has([data-issues-collapse]) {
              padding-right: calc(var(--padding-left) / 2);
            }

            [data-cross] {
              translate: 0px -1px;
            }
          }

          [data-issues-open] {
            font-size: var(--size-13);
            color: white;
            width: fit-content;
            height: 100%;
            display: flex;
            gap: 2px;
            align-items: center;
            margin: 0;
            line-height: var(--size-36);
            font-weight: 500;
            z-index: 2;
            white-space: nowrap;

            &:focus-visible {
              outline: 0;
            }
          }

          [data-issues-collapse] {
            width: var(--size-24);
            height: var(--size-24);
            border-radius: var(--rounded-full);
            transition: background var(--duration-short) ease;

            &:hover {
              background: var(--color-hover-alpha-error);
            }
          }

          [data-cross] {
            color: #fff;
            width: var(--size-12);
            height: var(--size-12);
          }

          [data-next-mark] {
            width: var(--mark-size);
            height: var(--mark-size);
            margin: 0 2px;
            display: flex;
            align-items: center;
            border-radius: var(--rounded-full);
            transition: background var(--duration-long) var(--timing);

            &:focus-visible {
              outline: 0;
            }

            &:hover {
              background: var(--color-hover-alpha-subtle);
            }

            svg {
              flex-shrink: 0;
              width: var(--size-40);
              height: var(--size-40);
            }
          }

          [data-issues-count-animation] {
            display: grid;
            place-items: center center;
            font-variant-numeric: tabular-nums;

            &[data-animate='false'] {
              [data-issues-count-exit],
              [data-issues-count-enter] {
                animation-duration: 0ms;
              }
            }

            > * {
              grid-area: 1 / 1;
            }

            [data-issues-count-exit] {
              animation: fadeOut 300ms var(--timing) forwards;
            }

            [data-issues-count-enter] {
              animation: fadeIn 300ms var(--timing) forwards;
            }
          }

          [data-issues-count-plural] {
            display: inline-block;
            &[data-animate='true'] {
              animation: fadeIn 300ms var(--timing) forwards;
            }
          }

          .paused {
            stroke-dashoffset: 0;
          }

          @keyframes fadeIn {
            0% {
              opacity: 0;
              filter: blur(2px);
              transform: translateY(8px);
            }
            100% {
              opacity: 1;
              filter: blur(0px);
              transform: translateY(0);
            }
          }

          @keyframes fadeOut {
            0% {
              opacity: 1;
              filter: blur(0px);
              transform: translateY(0);
            }
            100% {
              opacity: 0;
              transform: translateY(-12px);
              filter: blur(2px);
            }
          }

          @media (prefers-reduced-motion) {
            [data-issues-count-exit],
            [data-issues-count-enter],
            [data-issues-count-plural] {
              animation-duration: 0ms !important;
            }
          }
        `}
      </style>
      <div
        data-next-badge
        data-error={hasError}
        data-error-expanded={isExpanded}
        data-status={hasError ? Status.None : currentStatus}
        data-animate={newErrorDetected}
        style={{ width }}
      >
        <div ref={ref}>
          {/* Children */}
          {!state.disableDevIndicator && (
            <button
              id="next-logo"
              ref={triggerRef}
              data-next-mark
              onClick={onTriggerClick}
              disabled={state.disableDevIndicator}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-controls="nextjs-dev-tools-menu"
              aria-label={`${isMenuOpen ? 'Close' : 'Open'} Next.js Dev Tools`}
              data-nextjs-dev-tools-button
              style={{
                display: showStatusIndicator && !hasError ? 'none' : 'flex',
              }}
              {...buttonProps}
            >
              <NextMark />
            </button>
          )}
          {isExpanded && (
            <>
              {/* Error badge has priority over cache indicator */}
              {(isErrorExpanded || state.disableDevIndicator) && (
                <div data-issues>
                  <button
                    data-issues-open
                    aria-label="Open issues overlay"
                    onClick={() => {
                      if (state.isErrorOverlayOpen) {
                        dispatch({
                          type: ACTION_ERROR_OVERLAY_CLOSE,
                        })
                        return
                      }
                      dispatch({ type: ACTION_ERROR_OVERLAY_OPEN })
                      setPanel(null)
                    }}
                  >
                    {state.disableDevIndicator && (
                      <div data-disabled-icon>
                        <Warning />
                      </div>
                    )}
                    <AnimateCount
                      // Used the key to force a re-render when the count changes.
                      key={totalErrorCount}
                      animate={newErrorDetected}
                      data-issues-count-animation
                    >
                      {totalErrorCount}
                    </AnimateCount>{' '}
                    <div>
                      Issue
                      {totalErrorCount > 1 && (
                        <span
                          aria-hidden
                          data-issues-count-plural
                          // This only needs to animate once the count changes from 1 -> 2,
                          // otherwise it should stay static between re-renders.
                          data-animate={
                            newErrorDetected && totalErrorCount === 2
                          }
                        >
                          s
                        </span>
                      )}
                    </div>
                  </button>
                  {!state.buildError && (
                    <button
                      data-issues-collapse
                      aria-label="Collapse issues badge"
                      onClick={() => {
                        if (state.disableDevIndicator) {
                          setDismissed(true)
                        } else {
                          setIsErrorExpanded(false)
                        }
                        // Move focus to the trigger to prevent having it stuck on this element
                        triggerRef.current?.focus()
                      }}
                    >
                      <Cross data-cross />
                    </button>
                  )}
                </div>
              )}
              {/* Status indicator shown when no errors */}
              {showStatusIndicator &&
                !hasError &&
                !state.disableDevIndicator && (
                  <StatusIndicator status={displayStatus} />
                )}
            </>
          )}
        </div>
      </div>
      <div aria-hidden data-dot />
    </div>
  )
}

function AnimateCount({
  children: count,
  animate = true,
  ...props
}: {
  children: number
  animate: boolean
}) {
  return (
    <div {...props} data-animate={animate}>
      <div aria-hidden data-issues-count-exit>
        {count - 1}
      </div>
      <div data-issues-count data-issues-count-enter>
        {count}
      </div>
    </div>
  )
}

function NextMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <g transform="translate(8.5, 13)">
        <path
          className="paused"
          d="M13.3 15.2 L2.34 1 V12.6"
          fill="none"
          stroke="url(#next_logo_paint0_linear_1357_10853)"
          strokeWidth="1.86"
          mask="url(#next_logo_mask0)"
          strokeDasharray="29.6"
          strokeDashoffset="29.6"
        />
        <path
          className="paused"
          d="M11.825 1.5 V13.1"
          strokeWidth="1.86"
          stroke="url(#next_logo_paint1_linear_1357_10853)"
          strokeDasharray="11.6"
          strokeDashoffset="11.6"
        />
      </g>
      <defs>
        <linearGradient
          id="next_logo_paint0_linear_1357_10853"
          x1="9.95555"
          y1="11.1226"
          x2="15.4778"
          y2="17.9671"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="0.604072" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="next_logo_paint1_linear_1357_10853"
          x1="11.8222"
          y1="1.40039"
          x2="11.791"
          y2="9.62542"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="next_logo_mask0">
          <rect width="100%" height="100%" fill="white" />
          <rect width="5" height="1.5" fill="black" />
        </mask>
      </defs>
    </svg>
  )
}
