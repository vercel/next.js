import { forwardRef, useEffect, useRef, useState } from 'react'
import { css } from '../../../../utils/css'
import mergeRefs from '../../../utils/merge-refs'
import { useMinimumLoadingTimeMultiple } from './use-minimum-loading-time-multiple'

interface Props extends React.ComponentProps<'button'> {
  issueCount: number
  isDevBuilding: boolean
  isDevRendering: boolean
  isBuildError: boolean
  onTriggerClick: () => void
  toggleErrorOverlay: () => void
}

const SIZE = '2.25rem' // 36px in 16px base
const SIZE_PX = 36
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
    disabled,
    issueCount,
    isDevBuilding,
    isDevRendering,
    isBuildError,
    onTriggerClick,
    toggleErrorOverlay,
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
          '--size': SIZE,
          '--duration-short': `${SHORT_DURATION_MS}ms`,
          // if the indicator is disabled and there are no errors, hide the badge
          display: disabled && !hasError ? 'none' : 'block',
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
            display: flex;
            gap: 2px;
            align-items: center;
            padding-left: 8px;
            padding-right: ${disabled || isBuildError
              ? '8px'
              : 'calc(2px * 2)'};
            height: var(--size-32);
            margin: 0 2px;
            border-radius: var(--rounded-full);
            transition: background var(--duration-short) ease;

            &:has([data-issues-open]:hover) {
              background: var(--color-hover-alpha-error);
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
            margin-left: 2px;
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
          width: hasError && width > SIZE_PX ? width : SIZE,
        }}
      >
        <div ref={ref}>
          {/* Children */}
          {!disabled && (
            <button
              ref={mergeRefs(triggerRef, propRef)}
              data-next-mark
              data-next-mark-loading={isLoading}
              onClick={onTriggerClick}
              {...props}
            >
              <NextMark isLoading={isLoading} isDevBuilding={isDevBuilding} />
            </button>
          )}
          {isErrorExpanded && (
            <div data-issues>
              <button
                data-issues-open
                aria-label="Open issues overlay"
                onClick={toggleErrorOverlay}
              >
                {disabled && (
                  <div data-disabled-icon>
                    <Warning />
                  </div>
                )}
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
              {!disabled && !isBuildError && (
                <button
                  data-issues-collapse
                  aria-label="Collapse issues badge"
                  onClick={() => {
                    setIsErrorExpanded(false)
                    // Move focus to the trigger to prevent having it stuck on this element
                    triggerRef.current?.focus()
                  }}
                >
                  <Cross data-cross />
                </button>
              )}
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

function NextMark({
  isLoading,
  isDevBuilding,
}: {
  isLoading?: boolean
  isDevBuilding?: boolean
}) {
  const strokeColor = isDevBuilding ? 'rgba(255,255,255,0.7)' : 'white'
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      data-next-mark-loading={isLoading}
    >
      <g transform="translate(8.5, 13)">
        <path
          className={isLoading ? 'path0' : 'paused'}
          d="M13.3 15.2 L2.34 1 V12.6"
          fill="none"
          stroke="url(#next_logo_paint0_linear_1357_10853)"
          strokeWidth="1.86"
          mask="url(#next_logo_mask0)"
          strokeDasharray="29.6"
          strokeDashoffset="29.6"
        />
        <path
          className={isLoading ? 'path1' : 'paused'}
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
          <stop stopColor={strokeColor} />
          <stop offset="0.604072" stopColor={strokeColor} stopOpacity="0" />
          <stop offset="1" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="next_logo_paint1_linear_1357_10853"
          x1="11.8222"
          y1="1.40039"
          x2="11.791"
          y2="9.62542"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={strokeColor} />
          <stop offset="1" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
        <mask id="next_logo_mask0">
          <rect width="100%" height="100%" fill="white" />
          <rect width="5" height="1.5" fill="black" />
        </mask>
      </defs>
    </svg>
  )
}

function Warning() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.98071 1.125L1.125 3.98071L1.125 8.01929L3.98071 10.875H8.01929L10.875 8.01929V3.98071L8.01929 1.125H3.98071ZM3.82538 0C3.62647 0 3.4357 0.0790176 3.29505 0.21967L0.21967 3.29505C0.0790176 3.4357 0 3.62647 0 3.82538V8.17462C0 8.37353 0.0790178 8.5643 0.21967 8.70495L3.29505 11.7803C3.4357 11.921 3.62647 12 3.82538 12H8.17462C8.37353 12 8.5643 11.921 8.70495 11.7803L11.7803 8.70495C11.921 8.5643 12 8.37353 12 8.17462V3.82538C12 3.62647 11.921 3.4357 11.7803 3.29505L8.70495 0.21967C8.5643 0.0790177 8.37353 0 8.17462 0H3.82538ZM6.5625 2.8125V3.375V6V6.5625H5.4375V6V3.375V2.8125H6.5625ZM6 9C6.41421 9 6.75 8.66421 6.75 8.25C6.75 7.83579 6.41421 7.5 6 7.5C5.58579 7.5 5.25 7.83579 5.25 8.25C5.25 8.66421 5.58579 9 6 9Z"
        fill="#EAEAEA"
      />
    </svg>
  )
}

export function Cross(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
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
