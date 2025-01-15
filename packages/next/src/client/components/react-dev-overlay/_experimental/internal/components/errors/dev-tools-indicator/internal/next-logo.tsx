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
  ...props
}: Props) => {
  const [isLoading, setIsLoading] = useState(false)
  const [isPressed, setIsPressed] = useState(false)

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
    <button
      onClick={onClick}
      data-next-logo
      data-error={issueCount > 0}
      style={{
        transform: isPressed ? 'scale(0.95)' : 'scale(1)',
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      {...props}
    >
      <style>
        {css`
          [data-next-logo] {
            --color-outer-border: var(--color-gray-1000);
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            background: rgba(0, 0, 0, 0.8);
            box-shadow:
              0 0 0 1px var(--color-outer-border),
              0px 16px 32px -8px rgba(0, 0, 0, 0.24);
            backdrop-filter: blur(48px);
            border-radius: 50%;
            user-select: none;
            cursor: pointer;
            transition: transform 0.1s ease;

            &[data-error='true'] {
              background: var(--color-red-900);
              border: 1px solid var(--color-red-700);

              @media (prefers-color-scheme: dark) {
                box-shadow: none;
              }
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

      {/* Add issue count circle if issues exist */}
      {issueCount > 0 ? (
        <div
          style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            width: '20px',
            height: '20px',
            background: 'var(--color-red-300)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-red-900)',
            fontSize: '12px',
            fontWeight: 500,
            zIndex: 2,
          }}
        >
          {issueCount}
        </div>
      ) : null}
      <NextMark isDevBuilding={isDevBuilding} isLoading={isLoading} />
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
      xmlns="http://www.w3.org/2000/svg"
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
