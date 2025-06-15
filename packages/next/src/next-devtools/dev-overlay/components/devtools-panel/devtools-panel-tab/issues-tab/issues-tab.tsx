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
import { Terminal } from '../../../terminal'
import { HotlinkedText } from '../../../hot-linked-text'
import { NEXTJS_HYDRATION_ERROR_LINK } from '../../../../../shared/react-19-hydration-error'
import { PseudoHtmlDiff } from '../../../../container/runtime-error/component-stack-pseudo-html'
import { CodeFrame } from '../../../code-frame/code-frame'
import { CallStack } from '../../../call-stack/call-stack'

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

  if (!activeError) {
    return null
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const errorDetails = useErrorDetails(
    activeError?.error,
    getSquashedHydrationErrorDetails
  )

  const error = activeError?.error

  const errorCode = extractNextErrorCode(error)
  const errorType = getErrorTypeLabel(error, activeError.type)
  // TOOD: May be better to always treat everything past the first blank line as notes
  // We're currently only special casing hydration error messages.
  const notes = errorDetails.notes
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
      <div data-nextjs-devtools-panel-tab-issues-content>
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

        <ErrorContent
          buildError={state.buildError}
          notes={notes}
          hydrationWarning={hydrationWarning}
          errorDetails={errorDetails}
          activeError={activeError}
        />
      </div>
    </div>
  )
}

function ErrorContent({
  notes,
  buildError,
  hydrationWarning,
  errorDetails,
  activeError,
}: {
  notes: string | null
  buildError: OverlayState['buildError']
  hydrationWarning: string | null
  errorDetails: {
    hydrationWarning: string | null
    notes: string | null
    reactOutputComponentDiff: string | null
  }
  activeError: ReadyRuntimeError
}) {
  if (buildError) {
    return <Terminal content={buildError} />
  }

  return (
    <>
      <div className="error-overlay-notes-container">
        {notes ? (
          <>
            <p
              id="nextjs__container_errors__notes"
              className="nextjs__container_errors__notes"
            >
              {notes}
            </p>
          </>
        ) : null}
        {hydrationWarning ? (
          <p
            id="nextjs__container_errors__link"
            className="nextjs__container_errors__link"
          >
            <HotlinkedText
              text={`See more info here: ${NEXTJS_HYDRATION_ERROR_LINK}`}
            />
          </p>
        ) : null}
      </div>
      {errorDetails.reactOutputComponentDiff ? (
        <PseudoHtmlDiff
          reactOutputComponentDiff={errorDetails.reactOutputComponentDiff || ''}
        />
      ) : null}
      <Suspense fallback={<div data-nextjs-error-suspended />}>
        <RuntimeError key={activeError.id.toString()} error={activeError} />
      </Suspense>
    </>
  )
}

function RuntimeError({ error }: { error: ReadyRuntimeError }) {
  const frames = useFrames(error)

  const firstFrame = useMemo(() => {
    const firstFirstPartyFrameIndex = frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )

    return frames[firstFirstPartyFrameIndex] ?? null
  }, [frames])

  if (!firstFrame.originalStackFrame) {
    return null
  }

  if (!firstFrame.originalCodeFrame) {
    return null
  }

  return (
    <>
      {firstFrame && (
        <CodeFrame
          stackFrame={firstFrame.originalStackFrame}
          codeFrame={firstFrame.originalCodeFrame}
        />
      )}

      {frames.length > 0 && <CallStack frames={frames} />}
    </>
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
    <button
      data-nextjs-devtools-panel-tab-issues-sidebar-frame
      data-nextjs-devtools-panel-tab-issues-sidebar-frame-active={
        idx === activeIdx
      }
      onClick={() => setActiveIndex(idx)}
    >
      <span data-nextjs-devtools-panel-tab-issues-sidebar-frame-error-type>
        {errorType}
      </span>
      <span data-nextjs-devtools-panel-tab-issues-sidebar-frame-source>
        {frameSource}
      </span>
    </button>
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
    display: flex;
    flex-direction: column;
    padding: 10px 8px;
    border-radius: var(--rounded-lg);
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
    display: inline-block;
    align-self: flex-start;
    color: var(--color-gray-1000);
    font-size: var(--size-14);
    font-weight: 500;
    line-height: var(--size-20);
  }

  [data-nextjs-devtools-panel-tab-issues-sidebar-frame-source] {
    display: inline-block;
    align-self: flex-start;
    color: var(--color-gray-900);
    font-size: var(--size-13);
    line-height: var(--size-18);
  }

  [data-nextjs-devtools-panel-tab-issues-content] {
    width: 100%;
    padding: 14px;
  }

  /* errors/dialog/header.tsx */
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

  /* errors.tsx */
  .nextjs-error-with-static {
    bottom: calc(16px * 4.5);
  }
  p.nextjs__container_errors__link {
    font-size: var(--size-14);
  }
  p.nextjs__container_errors__notes {
    color: var(--color-stack-notes);
    font-size: var(--size-14);
    line-height: 1.5;
  }
  .nextjs-container-errors-body > h2:not(:first-child) {
    margin-top: calc(16px + 8px);
  }
  .nextjs-container-errors-body > h2 {
    color: var(--color-title-color);
    margin-bottom: 8px;
    font-size: var(--size-20);
  }
  .nextjs-toast-errors-parent {
    cursor: pointer;
    transition: transform 0.2s ease;
  }
  .nextjs-toast-errors-parent:hover {
    transform: scale(1.1);
  }
  .nextjs-toast-errors {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }
  .nextjs-toast-errors > svg {
    margin-right: 8px;
  }
  .nextjs-toast-hide-button {
    margin-left: 24px;
    border: none;
    background: none;
    color: var(--color-ansi-bright-white);
    padding: 0;
    transition: opacity 0.25s ease;
    opacity: 0.7;
  }
  .nextjs-toast-hide-button:hover {
    opacity: 1;
  }
  .nextjs__container_errors__error_title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .error-overlay-notes-container {
    margin: 8px 2px;
  }
  .error-overlay-notes-container p {
    white-space: pre-wrap;
  }
`
