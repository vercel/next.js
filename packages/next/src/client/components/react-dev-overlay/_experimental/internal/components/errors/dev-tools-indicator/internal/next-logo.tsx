import { useEffect, useState } from 'react'
import { noop as css } from '../../../../../../internal/helpers/noop-template'

interface Props extends React.ComponentProps<'button'> {
  issueCount: number
  onClick: () => void
  isDevBuilding: boolean
  isDevRendering: boolean
}

export const NextLogo = ({
  issueCount,
  onClick,
  isDevBuilding,
  isDevRendering,
}: Props) => {
  const [isLoading, setIsLoading] = useState(false)

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
    <button onClick={onClick} data-next-logo data-error={issueCount > 0}>
      <style>
        {css`
          [data-next-logo] {
            --color-outer-border: var(--color-gray-1000);
            --color-inner-border: hsla(0, 0%, 100%, 0.14);
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            background: rgba(0, 0, 0, 0.8);
            box-shadow:
              0 0 0 1px var(--color-outer-border),
              inset 0 0 0 1px var(--color-inner-border),
              0px 16px 32px -8px rgba(0, 0, 0, 0.24);
            backdrop-filter: blur(48px);
            border-radius: 50%;
            user-select: none;
            cursor: pointer;
            scale: 1;
            transition: scale 150ms ease;

            &:active {
              scale: 0.95;
            }

            &[data-error='true'] {
              background: #ca2a30;
              --color-inner-border: #e5484d;

              &:after {
                opacity: 0;
              }

              [data-issue-badge] {
                display: block !important;
              }
            }
          }

          [data-issue-badge] {
            top: 0;
            right: 0;
            position: absolute;
            width: 8px;
            height: 8px;
            background: white;
            border-radius: 50%;
            box-shadow: 0 0 0 1px #171717;
            display: none;
            z-index: 2;
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
      <NextMark isLoading={isLoading} />
      <div data-issue-badge />
    </button>
  )
}

function NextMark({ isLoading }: { isLoading?: boolean }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      style={{ scale: 1.2, translate: '0 1px' }}
    >
      <g transform="translate(13, 12)">
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
