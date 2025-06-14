import { Suspense, useMemo, useState } from 'react'
import {
  GenericErrorDescription,
  getErrorTypeLabel,
  HydrationErrorDescription,
  useErrorDetails,
} from '../../../../container/errors'
import { EnvironmentNameLabel } from '../../../errors/environment-name-label/environment-name-label'
import { ErrorMessage } from '../../../errors/error-message/error-message'
import { ErrorOverlayToolbar } from '../../../errors/error-overlay-toolbar/error-overlay-toolbar'
import { ErrorTypeLabel } from '../../../errors/error-type-label/error-type-label'
import {
  useFrames,
  type ReadyRuntimeError,
} from '../../../../utils/get-error-by-type'
import type { HydrationErrorState } from '../../../../../shared/hydration-error'
import type { OverlayState } from '../../../../shared'
import { extractNextErrorCode } from '../../../../../../lib/error-telemetry-utils'
import { css } from '../../../../utils/css'
import { getFrameSource } from '../../../../../shared/stack-frame'

export function IssuesTab({
  state,
  runtimeErrors,
  getSquashedHydrationErrorDetails,
}: {
  state: OverlayState
  runtimeErrors: ReadyRuntimeError[]
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
}) {
  const [activeIdx, setActiveIndex] = useState<number>(0)
  const activeError = useMemo<ReadyRuntimeError | null>(
    () =>
      // TODO: correct fallback
      runtimeErrors[activeIdx] ?? {
        error: new Error('No error'),
        type: 'runtime',
      },
    [activeIdx, runtimeErrors]
  )
  const error = activeError?.error

  const errorCode = extractNextErrorCode(error)
  const errorType = getErrorTypeLabel(error, activeError.type)
  const errorDetails = useErrorDetails(
    activeError?.error,
    getSquashedHydrationErrorDetails
  )
  const hydrationWarning = errorDetails.hydrationWarning
  const errorMessage = hydrationWarning ? (
    <HydrationErrorDescription message={hydrationWarning} />
  ) : (
    <GenericErrorDescription error={error} />
  )

  return (
    <div data-nextjs-devtools-panel-tab-issues>
      <aside data-nextjs-devtools-panel-tab-issues-sidebar>
        <Suspense fallback={<div>Loading...</div>}>
          {runtimeErrors.map((runtimeError, idx) => {
            return (
              <Foo
                key={idx}
                runtimeError={runtimeError}
                errorType={errorType}
                idx={idx}
                activeIdx={activeIdx}
                setActiveIndex={setActiveIndex}
              />
            )
          })}
        </Suspense>
      </aside>
      <div className="nextjs-container-errors-header">
        <div
          className="nextjs__container_errors__error_title"
          // allow assertion in tests before error rating is implemented
          data-nextjs-error-code={errorCode}
        >
          <span data-nextjs-error-label-group>
            <ErrorTypeLabel errorType={errorType} />
            {error.environmentName && (
              <EnvironmentNameLabel environmentName={error.environmentName} />
            )}
          </span>
          <ErrorOverlayToolbar error={error} debugInfo={state.debugInfo} />
        </div>
        <ErrorMessage errorMessage={errorMessage} />
      </div>
    </div>
  )
}

function Foo({
  runtimeError,
  errorType,
  idx,
  activeIdx,
  setActiveIndex,
}: {
  runtimeError: ReadyRuntimeError
  errorType: string
  idx: number
  activeIdx: number
  setActiveIndex: (idx: number) => void
}) {
  const frames = useFrames(runtimeError)

  const firstFrame = useMemo(() => {
    const firstFirstPartyFrameIndex = frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )

    return frames[firstFirstPartyFrameIndex] ?? null
  }, [frames])

  const frameSource = getFrameSource(firstFrame.originalStackFrame!)
  return (
    <div
      data-nextjs-devtools-panel-tab-issues-sidebar-frame
      data-nextjs-devtools-panel-tab-issues-sidebar-frame-active={
        idx === activeIdx
      }
      onClick={() => setActiveIndex(idx)}
    >
      <div data-nextjs-devtools-panel-tab-issues-sidebar-frame-error-type>
        {errorType}
      </div>
      <div data-nextjs-devtools-panel-tab-issues-sidebar-frame-source>
        {frameSource}
      </div>
    </div>
  )
}

export const DEVTOOLS_PANEL_TAB_ISSUES_STYLES = css`
  [data-nextjs-devtools-panel-tab-issues] {
    display: flex;
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar] {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border-right: 1px solid var(--color-gray-400);

    min-width: 128px;

    @media (min-width: 576px) {
      max-width: 138px;
      width: 100%;
    }

    @media (min-width: 768px) {
      max-width: 172.5px;
      width: 100%;
    }

    @media (min-width: 992px) {
      max-width: 230px;
      width: 100%;
    }
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame] {
    padding: 10px 8px;
    border-radius: var(--rounded-lg);
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;

    &:hover {
      background-color: var(--color-gray-200);
    }

    &:active {
      background-color: var(--color-gray-300);
    }
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-active='true'] {
    background-color: var(--color-gray-100);
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-error-type] {
    color: var(--color-gray-1000);
    font-size: var(--size-14);
    font-weight: 500;
    line-height: var(--size-20);
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-source] {
    color: var(--color-gray-900);
    font-size: var(--size-13);
    line-height: var(--size-18);
  }

  .nextjs-container-errors-header {
    position: relative;
  }
  .nextjs-container-errors-header > h1 {
    font-size: var(--size-20);
    line-height: var(--size-24);
    font-weight: bold;
    margin: calc(16px * 1.5) 0;
    color: var(--color-title-h1);
  }
  .nextjs-container-errors-header small {
    font-size: var(--size-14);
    color: var(--color-accents-1);
    margin-left: 16px;
  }
  .nextjs-container-errors-header small > span {
    font-family: var(--font-stack-monospace);
  }
  .nextjs-container-errors-header > div > small {
    margin: 0;
    margin-top: 4px;
  }
  .nextjs-container-errors-header > p > a {
    color: inherit;
    font-weight: bold;
  }
  .nextjs-container-errors-header
    > .nextjs-container-build-error-version-status {
    position: absolute;
    top: 16px;
    right: 16px;
  }
`
