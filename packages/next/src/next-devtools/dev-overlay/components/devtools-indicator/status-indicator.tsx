import type { CacheIndicatorState } from '../../cache-indicator'
import { css } from '../../utils/css'

export enum Status {
  None = 'none',
  Rendering = 'rendering',
  RenderingColdCache = 'rendering-cold-cache',
  RenderingCacheDisabled = 'rendering-cache-disabled',
  Compiling = 'compiling',
}

export function getCurrentStatus(
  buildingIndicator: boolean,
  renderingIndicator: boolean,
  cacheIndicator: CacheIndicatorState
): Status {
  // Priority order: compiling > rendering. While a client transition is
  // pending, the cache state colors and labels the rendering status; once it
  // settles, the cache state is shown as a persistent badge instead (handled in
  // next-logo).
  if (buildingIndicator) {
    return Status.Compiling
  }
  if (renderingIndicator) {
    if (cacheIndicator === 'cold') {
      return Status.RenderingColdCache
    }
    if (cacheIndicator === 'bypass') {
      return Status.RenderingCacheDisabled
    }
    return Status.Rendering
  }
  return Status.None
}

interface StatusIndicatorProps {
  status: Status
  onClick?: () => void
}

export function StatusIndicator({ status, onClick }: StatusIndicatorProps) {
  const statusText: Record<Status, string> = {
    [Status.None]: '',
    [Status.Compiling]: 'Compiling',
    [Status.Rendering]: 'Rendering',
    [Status.RenderingColdCache]: 'Rendering (cold cache)',
    [Status.RenderingCacheDisabled]: 'Rendering (cache disabled)',
  }

  // Status dot colors: teal while rendering normally, orange when the render
  // hit a cold cache or bypassed caches.
  const statusDotColor: Record<Status, string> = {
    [Status.None]: '',
    [Status.Compiling]: '#f5a623',
    [Status.Rendering]: '#50e3c2',
    [Status.RenderingColdCache]: '#f5a623',
    [Status.RenderingCacheDisabled]: '#f5a623',
  }

  if (status === Status.None) {
    return null
  }

  return (
    <>
      <style>
        {css`
          [data-indicator-status] {
            --padding-left: 8px;
            display: flex;
            gap: 6px;
            align-items: center;
            padding-left: 12px;
            padding-right: 8px;
            height: var(--size-32);
            margin-right: 2px;
            border-radius: var(--rounded-full);
            transition: background var(--duration-short) ease;
            color: white;
            font-size: var(--size-13);
            font-weight: 500;
            white-space: nowrap;
            border: none;
            background: transparent;
            cursor: pointer;
            outline: none;
          }

          [data-indicator-status]:focus-visible {
            outline: 2px solid var(--color-blue-800, #3b82f6);
            outline-offset: 3px;
          }

          [data-status-dot] {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
          }

          [data-status-text-animation] {
            display: inline-flex;
            align-items: center;
            position: relative;
            overflow: hidden;
            height: 100%;

            > * {
              white-space: nowrap;
              line-height: 1;
            }

            [data-status-text-enter] {
              animation: slotMachineEnter 150ms cubic-bezier(0, 0, 0.2, 1)
                forwards;
            }
          }

          [data-status-ellipsis] {
            display: inline-flex;
            margin-left: 2px;
          }

          [data-status-ellipsis] span {
            animation: ellipsisFade 1.2s infinite;
            margin: 0 1px;
          }

          [data-status-ellipsis] span:nth-child(2) {
            animation-delay: 0.2s;
          }

          [data-status-ellipsis] span:nth-child(3) {
            animation-delay: 0.4s;
          }

          @keyframes ellipsisFade {
            0%,
            60%,
            100% {
              opacity: 0.2;
            }
            30% {
              opacity: 1;
            }
          }

          @keyframes slotMachineEnter {
            0% {
              transform: translateY(0.8em);
              opacity: 0;
            }
            50% {
              opacity: 0.8;
            }
            100% {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}
      </style>
      <button
        data-indicator-status
        data-nextjs-dev-tools-button
        onClick={onClick}
        aria-label={'Open Next.js Dev Tools'}
      >
        {statusDotColor[status] && (
          <div
            data-status-dot
            style={{
              backgroundColor: statusDotColor[status],
            }}
          />
        )}
        <AnimateStatusText
          key={status} // Key here triggers re-mount and animation
          statusKey={status}
          showEllipsis
        >
          {statusText[status]}
        </AnimateStatusText>
      </button>
    </>
  )
}

function AnimateStatusText({
  children: text,
  showEllipsis = true,
}: {
  children: string
  statusKey?: string // Keep for type compatibility but unused
  showEllipsis?: boolean
}) {
  return (
    <div data-status-text-animation>
      <div data-status-text-enter>
        {text}
        {showEllipsis && (
          <span data-status-ellipsis>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}
      </div>
    </div>
  )
}
