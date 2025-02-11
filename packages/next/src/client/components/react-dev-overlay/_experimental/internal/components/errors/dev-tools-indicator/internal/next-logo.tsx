import { forwardRef, useEffect, useRef, useState } from 'react'
import { noop as css } from '../../../../../../internal/helpers/noop-template'
import mergeRefs from '../../../../helpers/merge-refs'
import { useMinimumLoadingTimeMultiple } from './use-minimum-loading-time-multiple'

interface Props extends React.ComponentProps<'button'> {
  issueCount: number
  isDevBuilding: boolean
  isDevRendering: boolean
  onTriggerClick: () => void
  openErrorOverlay: () => void
}

const SIZE = 36
const SHORT_DURATION_MS = 150

/**
 * A hook that creates an animated state based on changes to a dependency.
 * When the dependency changes and passes the shouldSkip check, it triggers
 * an animation state that lasts for the specified duration.
 *
 * @param dep The dependency to watch for changes
 * @param config Configuration object containing:
 *               - shouldSkip: Function to determine if animation should be skipped
 *               - animationDuration: Duration of the animation in milliseconds
 * @returns Boolean indicating if animation is currently active
 */
const useAnimated = <T,>(
  dep: T,
  config: { shouldSkip: (dep: T) => boolean; animationDuration: number }
) => {
  const { shouldSkip: _shouldSkip, animationDuration } = config
  const shouldSkipRef = useRef(_shouldSkip) // ensure stable reference in case it's not

  const [animatedDep, setAnimatedDep] = useState(false)
  const isInitialRef = useRef(true)

  useEffect(() => {
    if (isInitialRef.current) {
      isInitialRef.current = false
      return
    }

    if (shouldSkipRef.current(dep)) {
      return
    }

    setAnimatedDep(true)
    const timeoutId = setTimeout(() => {
      setAnimatedDep(false)
    }, animationDuration)

    return () => clearTimeout(timeoutId)
  }, [dep, animationDuration])

  return animatedDep
}

export const NextLogo = forwardRef(function NextLogo(
  {
    issueCount,
    isDevBuilding,
    isDevRendering,
    onTriggerClick,
    openErrorOverlay,
    ...props
  }: Props,
  propRef: React.Ref<HTMLButtonElement>
) {
  const hasError = issueCount > 0
  const [isErrorExpanded, setIsErrorExpanded] = useState(hasError)
  const newErrorDetected = useAnimated(issueCount, {
    shouldSkip: (count) => count === 0,
    animationDuration: SHORT_DURATION_MS,
  })

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const width = useMeasureWidth(ref)

  const isLoading = useMinimumLoadingTimeMultiple(
    isDevBuilding || isDevRendering
  )

  useEffect(() => {
    setIsErrorExpanded(hasError)
  }, [hasError])

  return (
    <div
      data-next-badge-root
      style={
        {
          '--size': `${SIZE}px`,
          '--duration-short': `${SHORT_DURATION_MS}ms`,
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
            --padding: 2px;
            --mark-size: calc(var(--size) - var(--padding) * 2);

            --focus-color: var(--color-blue-800);
            --focus-ring: 2px solid var(--focus-color);

            &:has([data-next-badge][data-error='true']) {
              --focus-color: #fff;
            }
          }

          [data-next-badge] {
            -webkit-font-smoothing: antialiased;
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
            border-radius: 9999px;
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
            width: 8px;
            height: 8px;
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
            display: flex;
            gap: var(--padding);
            align-items: center;
            padding-left: 8px;
            padding-right: calc(var(--padding) * 2);
            height: 32px;
            margin: 0 var(--padding);
            border-radius: 9999px;
            transition: background var(--duration-short) ease;

            &:has([data-issues-open]:hover) {
              background: var(--color-hover-alpha-error);
            }

            [data-cross] {
              translate: 0px -1px;
            }
          }

          [data-issues-open] {
            font-size: 13px;
            color: white;
            width: fit-content;
            height: 100%;
            display: flex;
            gap: 2px;
            align-items: center;
            margin: 0;
            line-height: 36px;
            font-weight: 500;
            z-index: 2;
            white-space: nowrap;

            &:focus-visible {
              outline: 0;
            }
          }

          [data-issues-collapse] {
            width: 24px;
            height: 24px;
            border-radius: 9999px;
            transition: background var(--duration-short) ease;

            &:hover {
              background: var(--color-hover-alpha-error);
            }
          }

          [data-cross] {
            color: #fff;
          }

          [data-next-mark] {
            width: var(--mark-size);
            height: var(--mark-size);
            margin-left: var(--padding);
            display: flex;
            align-items: center;
            border-radius: 9999px;
            transition: background var(--duration-long) var(--timing);

            &:focus-visible {
              outline: 0;
            }

            &:hover {
              background: var(--color-hover-alpha-subtle);
            }

            svg {
              flex-shrink: 0;
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
            animation: fadeIn 300ms var(--timing) forwards;
          }

          .path0 {
            animation: draw0 1.5s ease-in-out infinite;
          }

          .path1 {
            animation: draw1 1.5s ease-out infinite;
            animation-delay: 0.3s;
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

          @keyframes draw0 {
            0%,
            25% {
              stroke-dashoffset: -29.6;
            }
            25%,
            50% {
              stroke-dashoffset: 0;
            }
            50%,
            75% {
              stroke-dashoffset: 0;
            }
            75%,
            100% {
              stroke-dashoffset: 29.6;
            }
          }

          @keyframes draw1 {
            0%,
            20% {
              stroke-dashoffset: -11.6;
            }
            20%,
            50% {
              stroke-dashoffset: 0;
            }
            50%,
            75% {
              stroke-dashoffset: 0;
            }
            75%,
            100% {
              stroke-dashoffset: 11.6;
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
        data-error-expanded={isErrorExpanded}
        data-animate={newErrorDetected}
        style={{
          width: hasError && width > SIZE ? width : SIZE,
        }}
      >
        <div ref={ref}>
          {/* Children */}
          <button
            ref={mergeRefs(triggerRef, propRef)}
            data-next-mark
            onClick={onTriggerClick}
            {...props}
          >
            <NextMark isLoading={isLoading} />
          </button>
          {isErrorExpanded && (
            <div data-issues>
              <button
                data-issues-open
                aria-label="Open issues overlay"
                onClick={openErrorOverlay}
              >
                <AnimateCount
                  // Used the key to force a re-render when the count changes.
                  key={issueCount}
                  animate={newErrorDetected}
                  data-issues-count-animation
                >
                  {issueCount}
                </AnimateCount>{' '}
                <div>
                  Issue
                  {issueCount > 1 && (
                    <span aria-hidden data-issues-count-plural>
                      s
                    </span>
                  )}
                </div>
              </button>
              <button
                data-issues-collapse
                aria-label="Collapse issues badge"
                onClick={() => {
                  setIsErrorExpanded(false)
                  // Move focus to the trigger to prevent having it stuck on this element
                  triggerRef.current?.focus()
                }}
              >
                <Cross />
              </button>
            </div>
          )}
        </div>
      </div>
      <div aria-hidden data-dot />
    </div>
  )
})

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

function useMeasureWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState<number>(0)

  useEffect(() => {
    const el = ref.current

    if (!el) {
      return
    }

    const observer = new ResizeObserver(() => {
      const { width: w } = el.getBoundingClientRect()
      setWidth(w)
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return width
}

function NextMark({ isLoading }: { isLoading?: boolean }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <g transform="translate(8.5, 13)">
        <path
          className={isLoading ? 'path0' : 'paused'}
          d="M13.3 15.2 L2.34 1 V12.6"
          fill="none"
          stroke="url(#paint0_linear_1357_10853)"
          strokeWidth="1.86"
          mask="url(#mask0)"
          strokeDasharray="29.6"
          strokeDashoffset="29.6"
        />
        <path
          className={isLoading ? 'path1' : 'paused'}
          d="M11.825 1.5 V13.1"
          strokeWidth="1.86"
          stroke="url(#paint1_linear_1357_10853)"
          strokeDasharray="11.6"
          strokeDashoffset="11.6"
        />
      </g>
      <defs>
        <linearGradient
          id="paint0_linear_1357_10853"
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
          id="paint1_linear_1357_10853"
          x1="11.8222"
          y1="1.40039"
          x2="11.791"
          y2="9.62542"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="mask0">
          <rect width="100%" height="100%" fill="white" />
          <rect width="5" height="1.5" fill="black" />
        </mask>
      </defs>
    </svg>
  )
}

function Cross() {
  return (
    <svg
      data-cross
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.08889 11.8384L2.62486 12.3024L1.69678 11.3744L2.16082 10.9103L6.07178 6.99937L2.16082 3.08841L1.69678 2.62437L2.62486 1.69629L3.08889 2.16033L6.99986 6.07129L10.9108 2.16033L11.3749 1.69629L12.3029 2.62437L11.8389 3.08841L7.92793 6.99937L11.8389 10.9103L12.3029 11.3744L11.3749 12.3024L10.9108 11.8384L6.99986 7.92744L3.08889 11.8384Z"
        fill="currentColor"
      />
    </svg>
  )
}
