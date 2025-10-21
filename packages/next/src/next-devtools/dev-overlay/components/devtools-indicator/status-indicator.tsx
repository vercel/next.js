import type { CacheIndicatorState } from '../../cache-indicator'
import { css } from '../../utils/css'

export enum Status {
  None = 'none',
  Rendering = 'rendering',
  Compiling = 'compiling',
  Prerendering = 'prerendering',
  CacheBypassing = 'cache-bypassing',
}

export function getCurrentStatus(
  buildingIndicator: boolean,
  renderingIndicator: boolean,
  cacheIndicator: CacheIndicatorState
): Status {
  const isCacheFilling = cacheIndicator === 'filling'
  const isCacheBypassing = cacheIndicator === 'bypass'

  // Priority order: cache bypassing > prerendering > compiling > rendering
  if (isCacheBypassing && renderingIndicator) {
    return Status.CacheBypassing
  }
  if (isCacheFilling) {
    return Status.Prerendering
  }
  if (buildingIndicator) {
    return Status.Compiling
  }
  if (renderingIndicator) {
    return Status.Rendering
  }
  return Status.None
}

interface StatusIndicatorProps {
  status: Status
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const statusText: Record<Status, string> = {
    [Status.None]: '',
    [Status.CacheBypassing]: 'Cache disabled',
    [Status.Prerendering]: 'Prerendering',
    [Status.Compiling]: 'Compiling',
    [Status.Rendering]: 'Rendering',
  }

  // Status dot colors
  const statusDotColor: Record<Status, string> = {
    [Status.None]: '',
    [Status.CacheBypassing]: '', // No dot for bypass, uses full pill color
    [Status.Prerendering]: '#f5a623',
    [Status.Compiling]: '#f5a623',
    [Status.Rendering]: '#50e3c2',
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
      <div data-indicator-status>
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
        >
          {statusText[status]}
        </AnimateStatusText>
      </div>
    </>
  )
}

function AnimateStatusText({
  children: text,
}: {
  children: string
  statusKey?: string // Keep for type compatibility but unused
}) {
  return (
    <div data-status-text-animation>
      <div data-status-text-enter>
        {text}
        <span data-status-ellipsis>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </div>
    </div>
  )
}
