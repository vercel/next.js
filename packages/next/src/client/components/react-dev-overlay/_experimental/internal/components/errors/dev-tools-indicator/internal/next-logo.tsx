import { useEffect, useRef, useState } from 'react'
import { noop as css } from '../../../../../../internal/helpers/noop-template'

interface Props extends React.ComponentProps<'button'> {
  issueCount: number
  onClick: () => void
  isDevBuilding: boolean
  isDevRendering: boolean
}

const SIZE = 36

export const NextLogo = ({
  issueCount,
  onClick,
  isDevBuilding,
  isDevRendering,
  ...props
}: Props) => {
  const hasError = issueCount > 0
  const [isLoading, setIsLoading] = useState(false)

  const ref = useRef<HTMLDivElement | null>(null)
  const width = useMeasureWidth(ref)

  // Only shows the loading state after a 200ms delay when building or rendering,
  // to avoid flashing the loading state for quick updates
  useEffect(() => {
    if (isDevBuilding || isDevRendering) {
      const timeout = setTimeout(() => {
        setIsLoading(true)
      }, 200)
      return () => clearTimeout(timeout)
    } else {
      setIsLoading(false)
    }
  }, [isDevBuilding, isDevRendering])

  return (
    <>
      {/* Styles */}
      <style>
        {css`
          [data-next-badge] {
            --timing: cubic-bezier(0.175, 0.5, 0.32, 1.1);
            --duration: 300ms;
            --color-outer-border: #171717;
            --color-inner-border: hsla(0, 0%, 100%, 0.14);
            --color-hover-alpha: hsla(0, 0%, 100%, 0.14);
            --color-hover-alpha-2: hsla(0, 0%, 100%, 0.23);
            --padding: 2px;
            --mark-size: calc(var(--size) - var(--padding) * 2);

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
            transition:
              scale 150ms var(--timing),
              width 250ms var(--timing),
              background 150ms ease;

            &:active:not([data-error='true']) {
              scale: 0.95;
            }

            &[data-error='true'] {
              background: #ca2a30;
              --color-inner-border: #e5484d;

              [data-next-mark] {
                background: var(--color-hover-alpha);

                &:hover {
                  background: var(--color-hover-alpha-2);
                }
              }
            }

            > div {
              display: flex;
            }
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
            transition: background 150ms ease;

            &:has([data-issues-open]:hover) {
              background: var(--color-hover-alpha);
            }

            [data-cross] {
              translate: 0 -1px;
            }
          }

          [data-issues-open] {
            font-size: 13px;
            color: white;
            width: fit-content;
            height: 100%;
            display: flex;
            gap: 8px;
            align-items: center;
            margin: 0;
            line-height: 36px;
            font-weight: 500;
            z-index: 2;
            white-space: nowrap;
          }

          [data-issues-close] {
            width: 24px;
            height: 24px;
            border-radius: 9999px;
            transition: background 150ms ease;

            &:hover {
              background: var(--color-hover-alpha);
            }
          }

          [data-next-mark] {
            width: var(--mark-size);
            height: var(--mark-size);
            margin-left: var(--padding);
            display: flex;
            align-items: center;
            border-radius: 9999px;
            transition: background var(--duration) var(--timing);

            svg {
              flex-shrink: 0;
            }
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
        `}
      </style>
      <div
        data-next-badge
        data-error={hasError}
        style={
          {
            width: hasError && width > SIZE ? width : SIZE,
            '--size': `${SIZE}px`,
          } as React.CSSProperties
        }
      >
        <div ref={ref}>
          {/* Children */}
          <button data-next-mark onClick={onClick} {...props}>
            <NextMark isLoading={isLoading} />
          </button>
          {hasError && (
            <div data-issues>
              <button data-issues-open aria-label="Open errors overlay">
                {issueCount} {issueCount === 1 ? 'Issue' : 'Issues'}
              </button>
              <button data-issues-close aria-label="Clear errors">
                <Cross />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M3.08889 11.8384L2.62486 12.3024L1.69678 11.3744L2.16082 10.9103L6.07178 6.99937L2.16082 3.08841L1.69678 2.62437L2.62486 1.69629L3.08889 2.16033L6.99986 6.07129L10.9108 2.16033L11.3749 1.69629L12.3029 2.62437L11.8389 3.08841L7.92793 6.99937L11.8389 10.9103L12.3029 11.3744L11.3749 12.3024L10.9108 11.8384L6.99986 7.92744L3.08889 11.8384Z"
        fill="#EAEAEA"
      />
    </svg>
  )
}
