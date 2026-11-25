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
}

/**
 * Temporary status text shown in the badge next to the N while compiling or
 * rendering. It is plain text, not a button, and goes away on its own. Cold
 * and cache-disabled renders read as plain "Rendering"; the persistent cache
 * badge explains the cache state once the load settles.
 */
export function StatusIndicator({ status }: StatusIndicatorProps) {
  const statusText: Record<Status, string> = {
    [Status.None]: '',
    [Status.Compiling]: 'Compiling',
    [Status.Rendering]: 'Rendering',
    [Status.RenderingColdCache]: 'Rendering',
    [Status.RenderingCacheDisabled]: 'Rendering',
  }

  // Status dot colors: amber while compiling, teal while rendering.
  const statusDotColor: Record<Status, string> = {
    [Status.None]: '',
    [Status.Compiling]: '#f5a623',
    [Status.Rendering]: '#50e3c2',
    [Status.RenderingColdCache]: '#50e3c2',
    [Status.RenderingCacheDisabled]: '#50e3c2',
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
            padding: 0 6px;
            height: var(--size-28);
            color: white;
            font-size: var(--size-13);
            font-weight: 500;
            white-space: nowrap;
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
      <span data-indicator-status role="status">
        {statusDotColor[status] && (
          <span
            aria-hidden
            data-status-dot
            style={{ backgroundColor: statusDotColor[status] }}
          />
        )}
        <AnimateStatusText
          key={status} // Key here triggers re-mount and animation
          statusKey={status}
          showEllipsis
        >
          {statusText[status]}
        </AnimateStatusText>
      </span>
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
