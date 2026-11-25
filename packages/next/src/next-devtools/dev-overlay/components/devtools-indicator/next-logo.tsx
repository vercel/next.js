import { useEffect, useId, useRef, useState } from 'react'
import { useUpdateAnimation } from './hooks/use-update-animation'
import { useMeasureWidth } from './hooks/use-measure-width'
import { Cross } from '../../icons/cross'
import { css } from '../../utils/css'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { useRenderErrorContext } from '../../dev-overlay'
import { useIndicatorDisplay } from '../../hooks/use-indicator-display'
import {
  ACTION_ERROR_OVERLAY_CLOSE,
  ACTION_ERROR_OVERLAY_OPEN,
  type ErrorOverlayTab,
} from '../../shared'
import { usePanelRouterContext } from '../../menu/context'
import { getIssueBucketState } from '../../menu/issue-bucket-state'
import { BASE_LOGO_SIZE } from '../../utils/indicator-metrics'
import { StatusIndicator, Status } from './status-indicator'
import { Tooltip } from '../tooltip/tooltip'

const SHORT_DURATION_MS = 150

function pluralize(count: number, word: string) {
  return count === 1 ? word : `${word}s`
}

/**
 * The badge is a single dark tray:
 *
 *   [N] [Issues] [Insights] [status or cache text] | [‹ or ×]
 *
 * - The N always opens the DevTools menu.
 * - Issues and Insights are separate colored buttons; each opens the error
 *   overlay on its own tab.
 * - Compiling/Rendering and cache states are plain text, not buttons.
 * - The trailing control belongs to the tray, never to a chip: ‹ collapses the
 *   diagnostics into the N, × dismisses the badge when the idle indicator is
 *   hidden. It is omitted while a temporary status is showing.
 * - Collapsed, the N turns red (issues) or amber (insights only); clicking it
 *   expands the badge again.
 */
export function NextLogo({
  onTriggerClick,
  ...buttonProps
}: { onTriggerClick: () => void } & React.ComponentProps<'button'>) {
  const { state, dispatch } = useDevOverlayContext()
  const { totalErrorCount, normalErrorCount, instantErrorCount } =
    useRenderErrorContext()
  const SIZE = BASE_LOGO_SIZE / state.scale
  const { panel, triggerRef, setPanel } = usePanelRouterContext()
  const isMenuOpen = panel === 'panel-selector'
  const canDrag = panel === null
  const disableTooltips = !canDrag || state.isErrorOverlayOpen
  const moveDescriptionId = useId()
  const tooltipDirection = state.devToolsPosition.startsWith('top')
    ? 'bottom'
    : 'top'
  const collapseLabel = state.disableDevIndicator
    ? 'Dismiss badge'
    : 'Collapse badge'

  const hasError = totalErrorCount > 0
  const { insightsOnly, hasNormal, hasInstant } = getIssueBucketState(
    normalErrorCount,
    instantErrorCount
  )
  const [isErrorExpanded, setIsErrorExpanded] = useState(hasError)
  const lastErrorId = state.errors[state.errors.length - 1]?.id
  const [previousDiagnostics, setPreviousDiagnostics] = useState({
    count: totalErrorCount,
    lastErrorId,
    hasVulnerabilityInsight: state.hasVulnerabilityInsight,
  })
  const [previousHideVersion, setPreviousHideVersion] = useState(
    state.devIndicatorHideVersion
  )
  const [dismissed, setDismissed] = useState(false)
  const [previousOverlayOpen, setPreviousOverlayOpen] = useState(
    state.isErrorOverlayOpen
  )
  if (previousOverlayOpen !== state.isErrorOverlayOpen) {
    setPreviousOverlayOpen(state.isErrorOverlayOpen)
    if (state.isErrorOverlayOpen) setIsErrorExpanded(true)
  }
  if (
    previousDiagnostics.count !== totalErrorCount ||
    previousDiagnostics.lastErrorId !== lastErrorId ||
    previousDiagnostics.hasVulnerabilityInsight !==
      state.hasVulnerabilityInsight
  ) {
    setPreviousDiagnostics({
      count: totalErrorCount,
      lastErrorId,
      hasVulnerabilityInsight: state.hasVulnerabilityInsight,
    })
    if (
      !hasError ||
      totalErrorCount > previousDiagnostics.count ||
      (lastErrorId ?? 0) > (previousDiagnostics.lastErrorId ?? 0) ||
      (state.hasVulnerabilityInsight &&
        !previousDiagnostics.hasVulnerabilityInsight)
    ) {
      setIsErrorExpanded(hasError)
      setDismissed(false)
    }
  }
  if (previousHideVersion !== state.devIndicatorHideVersion) {
    setPreviousHideVersion(state.devIndicatorHideVersion)
    setDismissed(true)
  }
  if (dismissed && !state.disableDevIndicator) {
    setDismissed(false)
  }
  const normalErrorAnimating = useUpdateAnimation(
    normalErrorCount,
    SHORT_DURATION_MS
  )
  const instantErrorAnimating = useUpdateAnimation(
    instantErrorCount,
    SHORT_DURATION_MS
  )
  const newErrorDetected = normalErrorAnimating || instantErrorAnimating
  // Each chip animates its own count, only when that count went up, and only
  // right after the change (not when the chip remounts on expand).
  const normalCountChange = useCountChange(normalErrorCount)
  const instantCountChange = useCountChange(instantErrorCount)

  // The status text and the persistent cache badge are owned by a single
  // state machine that handles the show/hide timing and the handoff between
  // the two. They are mutually exclusive.
  const { status: displayStatus, cacheBadge } = useIndicatorDisplay(
    state.buildingIndicator,
    state.renderingIndicator,
    state.cacheIndicator
  )
  const [cacheBadgeCollapsed, setCacheBadgeCollapsed] = useState(false)
  const [previousCacheBadge, setPreviousCacheBadge] = useState(cacheBadge)
  if (previousCacheBadge !== cacheBadge) {
    setPreviousCacheBadge(cacheBadge)
    setCacheBadgeCollapsed(false)
  }

  const showStatusIndicator =
    displayStatus !== Status.None && !state.disableDevIndicator
  const showIssues = hasError && (isErrorExpanded || state.disableDevIndicator)
  const isCollapsed = hasError && !showIssues
  const showCacheBadge =
    cacheBadge !== null &&
    !cacheBadgeCollapsed &&
    !hasError &&
    !state.disableDevIndicator
  // Build errors can be collapsed, but not dismissed: the app cannot run
  // until they are fixed.
  const canCloseIssues =
    showIssues && !(state.buildError && state.disableDevIndicator)
  const showControl = !showStatusIndicator && (canCloseIssues || showCacheBadge)
  const collapsedTone = isCollapsed
    ? insightsOnly
      ? 'insight'
      : 'issue'
    : undefined
  const collapsedCount = normalErrorCount + instantErrorCount
  const collapsedKind =
    hasNormal && hasInstant ? 'diagnostic' : hasNormal ? 'issue' : 'Insight'
  const collapsedLabel = `Show ${collapsedCount} ${pluralize(collapsedCount, collapsedKind)}`

  const ref = useRef<HTMLDivElement | null>(null)
  const measuredWidth = useMeasureWidth(ref)

  const isExpanded = showIssues || showCacheBadge || showStatusIndicator
  const width = measuredWidth === 0 ? 'auto' : measuredWidth

  function openOverlay(tab: ErrorOverlayTab) {
    if (state.isErrorOverlayOpen && state.errorOverlayTab === tab) {
      dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
      return
    }
    dispatch({ type: ACTION_ERROR_OVERLAY_OPEN, tab })
    // Keep the instant navigation panel mounted so its capture survives and
    // it stays behind the error overlay backdrop. Other panels still close
    // when the overlay opens.
    if (panel !== 'instant-navs') {
      setPanel(null)
    }
  }

  function chipTitle(label: string) {
    return `View ${label}`
  }

  return (
    <div
      data-next-badge-root
      style={
        {
          '--size': `${SIZE}px`,
          '--duration-short': `${SHORT_DURATION_MS}ms`,
          // Diagnostics retain access to the menu when the idle indicator is
          // hidden. Non-build diagnostics can still be explicitly dismissed.
          display:
            state.disableDevIndicator &&
            (!hasError || (dismissed && !state.buildError))
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
            --color-issue: #ca2a30;
            --color-issue-border: #e5484d;
            --color-insight: rgba(217, 119, 6, 0.95);
            --color-insight-border: rgba(245, 158, 11, 0.9);
            --color-cache: #47a8ff;
            --chip-height: var(--mark-size);
            --mark-size: calc(var(--size) - var(--size-2) * 2);

            --focus-color: var(--color-blue-800);
            --focus-ring: 2px solid var(--focus-color);
          }

          [data-next-badge-description] {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            overflow: hidden;
            clip-path: inset(50%);
            white-space: nowrap;
          }

          [data-next-badge] [data-draggable='true'] {
            cursor: grab;
          }

          .devtools-indicator-tooltip {
            width: max-content;
            max-width: min(320px, calc(100vw - 32px));
          }

          /* The tray. Always dark; the chips inside carry the color. */
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
            overflow: hidden;
            will-change: width;
            /* No scale bump on new diagnostics: the count rolling in is the
               signal, and the badge keeps a steady size. */
            transition: width var(--duration-long) var(--timing);

            &:has([data-next-mark]:focus-visible) {
              outline: var(--focus-ring);
              outline-offset: 3px;
            }

            > div {
              display: flex;
              align-items: center;
              gap: var(--size-4);
            }

            /* Everything inside the tray sits 2px from its edge, so the N,
               the chips and the control are concentric with the tray. */
            &[data-error-expanded='true'] > div {
              padding-right: var(--size-2);
            }

            &[data-error-expanded='true'] [data-next-mark] {
              background: hsla(0, 0%, 100%, 0.08);

              &:hover {
                background: var(--color-hover-alpha-subtle);
              }
            }

            /* Collapsed diagnostics: the whole circle takes the color. */
            &[data-collapsed='issue'] {
              background: var(--color-issue);
              --color-inner-border: var(--color-issue-border);
            }

            &[data-collapsed='insight'] {
              background: var(--color-insight);
              --color-inner-border: var(--color-insight-border);
            }

            &[data-collapsed] [data-next-mark]:hover {
              background: hsla(0, 0%, 100%, 0.18);
            }
          }

          [data-next-mark] {
            flex: none;
            width: var(--mark-size);
            height: var(--mark-size);
            margin: 0 var(--size-2);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--rounded-full);
            /* Explicit so the browser's default button background never shows
               while the badge first renders. */
            background: transparent;
            transition: background var(--duration-short) ease;

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

          [data-next-badge][data-error-expanded='true'] [data-next-mark] {
            margin-right: 0;
          }

          /* Issues and Insights: separate colored buttons. */
          [data-issues-group] {
            display: flex;
            align-items: center;
            gap: var(--size-4);
          }

          [data-issues-open] {
            cursor: pointer;
            height: var(--chip-height);
            padding: 0 var(--size-12);
            display: flex;
            gap: var(--size-4);
            align-items: center;
            border-radius: var(--rounded-full);
            color: white;
            font-size: var(--size-13);
            font-weight: 500;
            line-height: var(--size-20);
            white-space: nowrap;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
            transition:
              filter var(--duration-short) ease,
              box-shadow var(--duration-short) ease;

            &[data-issues-tab='errors'] {
              background: var(--color-issue);
            }

            &[data-issues-tab='instant'] {
              background: var(--color-insight);
            }

            &:hover {
              filter: brightness(1.15);
              box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
            }

            &:focus-visible {
              outline: 2px solid #fff;
              outline-offset: -2px;
            }
          }

          /* Status and cache text aren't buttons. */
          [data-cache-label],
          [data-indicator-status] {
            cursor: default;
          }

          /* Cache state after a load: plain text, not a button. */
          [data-cache-label] {
            display: flex;
            align-items: center;
            gap: var(--size-6);
            padding: 0 var(--size-6);
            color: white;
            font-size: var(--size-13);
            font-weight: 500;
            white-space: nowrap;
          }

          [data-cache-dot] {
            flex: none;
            width: var(--size-8);
            height: var(--size-8);
            border-radius: 50%;
            background: var(--color-cache);
          }

          /* The trailing control is its own small circle, like a smaller N. */
          [data-issues-collapse] {
            flex: none;
            width: var(--size-24);
            height: var(--size-24);
            /* 6px from the badge edge on every side, like the chips are 2px. */
            margin-right: var(--size-4);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--rounded-full);
            background: transparent;
            color: rgba(255, 255, 255, 0.8);
            transition:
              background var(--duration-short) ease,
              color var(--duration-short) ease;

            &:hover {
              background: var(--color-hover-alpha-subtle);
              color: #fff;
            }

            &:focus-visible {
              outline: var(--focus-ring);
            }
          }

          [data-collapse-chevron] {
            width: var(--size-6);
            height: var(--size-10);
          }

          [data-cross] {
            width: var(--size-10);
            height: var(--size-10);
          }

          /* Collapsed count on the N's corner. Decorative only: the whole
             colored N is the button that expands the badge. */
          [data-collapsed-count] {
            position: absolute;
            top: calc(var(--size-6) * -1);
            left: calc(var(--size) - var(--size-12));
            min-width: var(--size-16);
            height: var(--size-16);
            padding: 0 var(--size-4);
            box-sizing: border-box;
            border-radius: var(--rounded-full);
            background: #171717;
            color: #fff;
            font-size: var(--size-10);
            font-weight: 600;
            line-height: var(--size-16);
            text-align: center;
            font-variant-numeric: tabular-nums;
            box-shadow: 0 0 0 1.5px #fff;
            pointer-events: none;
            z-index: 1;
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
            [data-issues-count-enter] {
              animation-duration: 0ms !important;
            }
          }
        `}
      </style>
      <span id={moveDescriptionId} data-next-badge-description>
        Drag to move the badge to another corner.
        {' To move it with a keyboard, open Preferences and choose Position.'}
      </span>
      <div
        data-next-badge
        data-error={hasError && !insightsOnly}
        data-insights-only={insightsOnly}
        data-error-expanded={isExpanded}
        data-collapsed={collapsedTone}
        data-status={displayStatus}
        data-cache-badge={cacheBadge ?? undefined}
        data-animate={newErrorDetected}
        style={{ width }}
      >
        <div ref={ref}>
          <Tooltip
            asChild
            disabled={disableTooltips}
            className="devtools-indicator-tooltip"
            direction={tooltipDirection}
            title={
              isCollapsed
                ? 'Expand badge. Drag to move.'
                : 'Open DevTools menu. Drag to move.'
            }
          >
            <button
              id="next-logo"
              ref={triggerRef}
              data-next-mark
              // Collapsed, the colored N stands in for the diagnostics, so
              // clicking it brings them back. Expanded, it opens the menu.
              onClick={
                isCollapsed ? () => setIsErrorExpanded(true) : onTriggerClick
              }
              aria-haspopup={isCollapsed ? undefined : 'menu'}
              aria-expanded={isCollapsed ? undefined : isMenuOpen}
              aria-controls={isCollapsed ? undefined : 'nextjs-dev-tools-menu'}
              aria-label={
                isCollapsed
                  ? collapsedLabel
                  : `${isMenuOpen ? 'Close' : 'Open'} Next.js Dev Tools`
              }
              aria-describedby={canDrag ? moveDescriptionId : undefined}
              data-draggable={canDrag}
              data-nextjs-dev-tools-button
              {...buttonProps}
            >
              <NextMark />
            </button>
          </Tooltip>
          {showIssues && (
            <div data-issues-group>
              {hasNormal && (
                <Tooltip
                  asChild
                  disabled={disableTooltips}
                  className="devtools-indicator-tooltip"
                  direction={tooltipDirection}
                  title={chipTitle(pluralize(normalErrorCount, 'issue'))}
                >
                  <button
                    data-issues
                    data-issues-open
                    data-issues-tab="errors"
                    aria-label={`Open ${normalErrorCount} ${pluralize(normalErrorCount, 'issue')}`}
                    onClick={() => openOverlay('errors')}
                  >
                    <AnimateCount
                      key={normalErrorCount}
                      change={normalCountChange}
                      countAttribute
                    >
                      {normalErrorCount}
                    </AnimateCount>
                    {pluralize(normalErrorCount, 'Issue')}
                  </button>
                </Tooltip>
              )}
              {hasInstant && (
                <Tooltip
                  asChild
                  disabled={disableTooltips}
                  className="devtools-indicator-tooltip"
                  direction={tooltipDirection}
                  title={chipTitle(pluralize(instantErrorCount, 'Insight'))}
                >
                  <button
                    data-issues={hasNormal ? undefined : true}
                    data-issues-open
                    data-issues-tab="instant"
                    aria-label={`Open ${instantErrorCount} ${pluralize(instantErrorCount, 'Insight')}`}
                    onClick={() => openOverlay('instant')}
                  >
                    {/* The leading chip owns data-issues-count, which test
                        utilities read as the badge's count. */}
                    <AnimateCount
                      key={instantErrorCount}
                      change={instantCountChange}
                      countAttribute={!hasNormal}
                    >
                      {instantErrorCount}
                    </AnimateCount>
                    {pluralize(instantErrorCount, 'Insight')}
                  </button>
                </Tooltip>
              )}
            </div>
          )}
          {showCacheBadge && cacheBadge && (
            <div
              data-cache-badge-group
              data-cache-bypass-badge={
                cacheBadge === 'bypass' ? true : undefined
              }
              data-cold-cache-badge={cacheBadge === 'cold' ? true : undefined}
              style={{ display: 'contents' }}
            >
              <span data-cache-label>
                <span aria-hidden data-cache-dot />
                {cacheBadge === 'bypass' ? 'Cache disabled' : 'Cold cache'}
              </span>
              {showControl && (
                <TrayControl
                  label="Collapse badge"
                  icon="collapse"
                  disableTooltips={disableTooltips}
                  tooltipDirection={tooltipDirection}
                  onClick={() => {
                    setCacheBadgeCollapsed(true)
                    triggerRef.current?.focus()
                  }}
                />
              )}
            </div>
          )}
          {showStatusIndicator && <StatusIndicator status={displayStatus} />}
          {showIssues && showControl && (
            <TrayControl
              label={collapseLabel}
              icon={state.disableDevIndicator ? 'dismiss' : 'collapse'}
              disableTooltips={disableTooltips}
              tooltipDirection={tooltipDirection}
              onClick={() => {
                if (state.disableDevIndicator) {
                  setDismissed(true)
                } else {
                  setIsErrorExpanded(false)
                  triggerRef.current?.focus()
                }
              }}
            />
          )}
        </div>
      </div>
      {isCollapsed && (
        <span aria-hidden data-collapsed-count>
          {collapsedCount}
        </span>
      )}
    </div>
  )
}

function TrayControl({
  label,
  icon,
  onClick,
  disableTooltips,
  tooltipDirection,
}: {
  label: string
  icon: 'collapse' | 'dismiss'
  onClick: () => void
  disableTooltips: boolean
  tooltipDirection: 'top' | 'bottom'
}) {
  return (
    <>
      <Tooltip
        asChild
        disabled={disableTooltips}
        className="devtools-indicator-tooltip"
        direction={tooltipDirection}
        title={label}
      >
        <button data-issues-collapse aria-label={label} onClick={onClick}>
          {icon === 'dismiss' ? (
            <Cross data-cross viewBox="1.5 1.5 11 11" />
          ) : (
            <CollapseChevron />
          )}
        </button>
      </Tooltip>
    </>
  )
}

type CountChange = { from: number } | null

/**
 * The previous value of a count, for the render right after it changed. It's
 * cleared after commit, so a chip that only remounts (for example when the
 * badge expands again) doesn't replay the animation.
 */
function useCountChange(count: number): CountChange {
  const [state, setState] = useState<{ count: number; change: CountChange }>({
    count,
    change: null,
  })
  if (state.count !== count) {
    setState({ count, change: { from: state.count } })
  }
  useEffect(() => {
    if (state.change === null) return
    const timeout = setTimeout(() => {
      setState((current) =>
        current.change === null ? current : { ...current, change: null }
      )
    })
    return () => clearTimeout(timeout)
  }, [state.change])
  return state.change
}

/**
 * Rolls the new count in and the previous one out. Keyed by the count, so it
 * plays once when that chip's count goes up; a chip that only remounts (for
 * example when the badge expands again) or whose count went down doesn't
 * animate.
 */
function AnimateCount({
  children: count,
  change,
  countAttribute,
}: {
  children: number
  change: CountChange
  /** The leading chip's count is what test utilities read. */
  countAttribute?: boolean
}) {
  // Captured on mount; the change is cleared right after.
  const [from] = useState(() =>
    change !== null && count > change.from ? change.from : null
  )
  const animate = from !== null
  return (
    <div data-issues-count-animation data-animate={animate}>
      {animate && (
        <div aria-hidden data-issues-count-exit>
          {from}
        </div>
      )}
      <div
        data-issues-count={countAttribute ? true : undefined}
        data-issues-count-enter
      >
        {count}
      </div>
    </div>
  )
}

function CollapseChevron() {
  return (
    <svg
      data-collapse-chevron
      // Cropped to the glyph so its box doesn't add invisible padding.
      viewBox="5 3 6 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m10 4-4 4 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function NextMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      {/* Centers the mark (its paths span x 1.4–14.2, y 0.5–15.7) in the
          40×40 box so it sits in the middle of the circle behind it. */}
      <g transform="translate(12.2, 11.9)">
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
