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
      style={{
        position: 'relative',
        cursor: 'pointer',
        userSelect: 'none',
        backdropFilter: 'blur(48px)',
        boxShadow:
          '0px 24px 32px -8px #0000001A, 0px 8px 16px -4px #0000001A, 0px 1px 1px 0px #00000026',
        borderRadius: '50%',
        transition: 'transform 0.1s ease',
        transform: isPressed ? 'scale(0.95)' : 'scale(1)',
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      {...props}
    >
      <style>
        {css`
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
            fontWeight: 'bold',
          }}
        >
          {issueCount}
        </div>
      ) : null}

      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ shapeRendering: 'geometricPrecision' }}
      >
        <defs>
          <clipPath id="circleClip">
            <circle cx="20" cy="20" r="20" />
          </clipPath>
        </defs>

        <g clipPath="url(#circleClip)">
          <g filter="url(#filter0_bdddi_1457_6023)">
            <circle cx="20" cy="20" r="20" fill={'black'} fillOpacity="0.8" />
            <g filter="url(#filter1_i_1457_6023)">
              <circle
                cx="20"
                cy="20"
                r="18.5"
                stroke="url(#paint0_angular_1457_6023)"
                strokeOpacity="0.8"
              />
              <circle
                cx="20"
                cy="20"
                r="18.5"
                stroke="white"
                strokeOpacity="0.2"
                style={{ mixBlendMode: 'multiply' }}
              />
              <circle
                cx="20"
                cy="20"
                r="18"
                fill={issueCount > 0 ? '#CA2A30' : '#2A2A2A'}
              />

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
            </g>
          </g>
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
            <stop
              stopColor={isDevBuilding ? 'rgba(255,255,255,0.7)' : 'white'}
            />
            <stop
              offset="0.604072"
              stopColor={isDevBuilding ? 'rgba(255,255,255,0.7)' : 'white'}
              stopOpacity="0"
            />
            <stop
              offset="1"
              stopColor={isDevBuilding ? 'rgba(255,255,255,0.7)' : 'white'}
              stopOpacity="0"
            />
          </linearGradient>
          <linearGradient
            id="paint1_linear_1357_10853"
            x1="11.8222"
            y1="1.40039"
            x2="11.791"
            y2="9.62542"
            gradientUnits="userSpaceOnUse"
          >
            <stop
              stopColor={isDevBuilding ? 'rgba(255,255,255,0.7)' : 'white'}
            />
            <stop
              offset="1"
              stopColor={isDevBuilding ? 'rgba(255,255,255,0.7)' : 'white'}
              stopOpacity="0"
            />
          </linearGradient>
          <mask id="mask0">
            <rect
              width="100%"
              height="100%"
              fill={isDevBuilding ? 'rgba(255,255,255,0.7)' : 'white'}
            />
            <rect width="5" height="1.5" fill="black" />
          </mask>

          <filter
            id="filter0_bdddi_1457_6023"
            x="0"
            y="0"
            width="40"
            height="40"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feGaussianBlur in="BackgroundImageFix" stdDeviation="24" />
            <feComposite
              in2="SourceAlpha"
              operator="in"
              result="effect1_backgroundBlur_1457_6023"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feMorphology
              radius="8"
              operator="erode"
              in="SourceAlpha"
              result="effect2_dropShadow_1457_6023"
            />
            <feOffset dy="24" />
            <feGaussianBlur stdDeviation="16" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
            />
            <feBlend
              mode="normal"
              in2="effect1_backgroundBlur_1457_6023"
              result="effect2_dropShadow_1457_6023"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feMorphology
              radius="4"
              operator="erode"
              in="SourceAlpha"
              result="effect3_dropShadow_1457_6023"
            />
            <feOffset dy="8" />
            <feGaussianBlur stdDeviation="8" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
            />
            <feBlend
              mode="normal"
              in2="effect2_dropShadow_1457_6023"
              result="effect3_dropShadow_1457_6023"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="1" />
            <feGaussianBlur stdDeviation="0.5" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0"
            />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect3_dropShadow_1457_6023"
              result="effect4_dropShadow_1457_6023"
            />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect4_dropShadow_1457_6023"
              result="shape"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dx="4" dy="4" />
            <feGaussianBlur stdDeviation="2" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.2 0"
            />
            <feBlend
              mode="lighten"
              in2="shape"
              result="effect5_innerShadow_1457_6023"
            />
          </filter>

          <filter
            id="filter1_i_1457_6023"
            x="1"
            y="1"
            width="39"
            height="42"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="4" />
            <feGaussianBlur stdDeviation="2" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"
            />
            <feBlend
              mode="normal"
              in2="shape"
              result="effect1_innerShadow_1457_6023"
            />
          </filter>

          <radialGradient
            id="paint0_angular_1457_6023"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(20 20) rotate(-90) scale(12.75)"
          >
            <stop stopColor="white" />
            <stop offset="0.0914784" stopColor="white" stopOpacity="0.463159" />
            <stop offset="0.405428" stopColor="white" stopOpacity="0.4" />
          </radialGradient>
        </defs>
      </svg>
    </button>
  )
}
