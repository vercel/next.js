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
            position: relative;
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #2a2a2a;
            box-shadow:
              0 0 0 1px var(--color-gray-1000),
              0px 1px 1px 0px rgba(0, 0, 0, 0.15),
              0px 8px 16px -4px rgba(0, 0, 0, 0.1),
              0px 24px 32px -8px rgba(0, 0, 0, 0.1),
              4px 4px 4px 0px rgba(255, 255, 255, 0.2) inset;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            transition: transform 0.1s ease;

            &[data-error='true'] {
              background: var(--color-red-900);
              box-shadow:
                0 0 0 1px var(--color-gray-1000),
                0px 1px 1px 0px rgba(0, 0, 0, 0.15),
                0px 8px 16px -4px rgba(0, 0, 0, 0.1),
                0px 24px 32px -8px rgba(0, 0, 0, 0.1);
            }

            &:after {
              content: '';
              width: calc(100% - 1px);
              height: calc(100% - 1px);
              border-radius: inherit;
              position: absolute;
              border: 1px solid rgba(255, 255, 255, 0.2);
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

;<svg
  width="18"
  height="20"
  viewBox="0 0 18 20"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M17.2569 18.5026L4.75556 2.39941H2.40015V13.5947H4.28448V4.79242L15.7778 19.642C16.2964 19.2949 16.7905 18.914 17.2569 18.5026Z"
    stroke="url(#paint0_linear_2156_6933)"
  />
  <rect
    x="11.8892"
    y="2.39941"
    width="1.86667"
    height="11.2"
    stroke="url(#paint1_linear_2156_6933)"
  />
  <defs>
    <linearGradient
      id="paint0_linear_2156_6933"
      x1="10.9557"
      y1="12.1216"
      x2="16.4779"
      y2="18.9661"
      gradientUnits="userSpaceOnUse"
    >
      <stop stopColor="white" />
      <stop offset="0.604072" stopOpacity="0" stopColor="white" />
      <stop offset="1" stopColor="white" stopOpacity="0" />
    </linearGradient>
    <linearGradient
      id="paint1_linear_2156_6933"
      x1="12.8225"
      y1="2.39941"
      x2="12.7912"
      y2="10.6244"
      gradientUnits="userSpaceOnUse"
    >
      <stop stopColor="white" />
      <stop offset="1" stopColor="white" stopOpacity="0" />
    </linearGradient>
  </defs>
</svg>
