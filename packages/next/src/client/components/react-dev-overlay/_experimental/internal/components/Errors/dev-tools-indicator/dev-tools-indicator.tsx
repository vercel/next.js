import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import { Toast } from '../../Toast'
import React, { useState } from 'react'

// TODO: test a11y
// TODO: add E2E tests to cover different scenarios

export function DevToolsIndicator({
  hasStaticIndicator,
  readyErrors,
  fullscreen,
  hide,
}: {
  readyErrors: ReadyRuntimeError[]
  fullscreen: () => void
  hide: () => void
  hasStaticIndicator?: boolean
}) {
  return (
    <DevToolsPopover
      onIssuesClick={fullscreen}
      issueCount={readyErrors.length}
      isStaticRoute={hasStaticIndicator === true}
      hide={hide}
    />
  )
}

const DevToolsPopover = ({
  onIssuesClick,
  issueCount,
  isStaticRoute,
  hide,
}: {
  onIssuesClick: () => void
  issueCount: number
  isStaticRoute: boolean
  hide: () => void
}) => {
  // TODO: close when clicking outside

  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const togglePopover = () => setIsPopoverOpen((prev) => !prev)
  return (
    <Toast style={{ boxShadow: 'none' }}>
      <NextLogo
        onClick={togglePopover}
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
              <p data-nextjs-dev-tools-version>Next.js 14.0.1</p>
              <p data-nextjs-dev-tools-version>Turbopack enabled</p>
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
    <span data-nextjs-dev-tools-issue-count>
      <span data-nextjs-dev-tools-issue-text data-has-issues={count > 0}>
        {count}
      </span>
    </span>
  )
}

const NextLogo = (props: React.ComponentProps<'svg'>) => {
  // TODO: animate it based on build status..
  // TODO: add red dot when there are errors + change color of the logo
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g filter="url(#filter0_bdddi_1457_6023)">
        <rect
          x="0"
          y="0"
          width="40"
          height="40"
          rx="20"
          fill="#333333"
          shapeRendering="crispEdges"
        />
        <rect
          x="0"
          y="0"
          width="40"
          height="40"
          rx="20"
          fill="black"
          fillOpacity="0.8"
          shapeRendering="crispEdges"
        />
        <g filter="url(#filter1_i_1457_6023)">
          <rect
            x="1.5"
            y="1.5"
            width="37"
            height="37"
            rx="18.5"
            stroke="url(#paint0_angular_1457_6023)"
            strokeOpacity="0.8"
          />
          <rect
            x="1.5"
            y="1.5"
            width="37"
            height="37"
            rx="18.5"
            stroke="white"
            strokeOpacity="0.2"
            style={{ mixBlendMode: 'multiply' }}
          />
          <rect x="2" y="2" width="36" height="36" rx="18" fill="#2A2A2A" />
          <path
            d="
          M30.2854 31.6696
          L16.3951 13.7771
          H13.7779
          V26.2163
          H15.8717
          V16.4359
          L28.6419 32.9356
          C29.2182 32.5499 29.7672 32.1267 30.2854 31.6696
        "
            fill="url(#paint1_linear_1457_6023)"
          />
          <rect
            x="24.3213"
            y="13.7771"
            width="2.0741"
            height="12.4444"
            fill="url(#paint2_linear_1457_6023)"
          />
        </g>
      </g>

      <defs>
        <filter
          id="filter0_bdddi_1457_6023"
          x="-2"
          y="-2"
          width="44"
          height="44"
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

        <linearGradient
          id="paint1_linear_1457_6023"
          x1="16.6174"
          y1="24.5796"
          x2="22.7532"
          y2="32.1846"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="0.604072" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>

        <linearGradient
          id="paint2_linear_1457_6023"
          x1="25.3583"
          y1="13.7771"
          x2="25.3235"
          y2="22.9160"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
