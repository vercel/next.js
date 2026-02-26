import { useCallback, useId, useReducer } from 'react'
import React from 'react'
import { CodeFrame } from '../../components/code-frame/code-frame'
import { ErrorOverlayCallStack } from '../../components/errors/error-overlay-call-stack/error-overlay-call-stack'
import type { ReadyErrorCause } from '../../utils/get-error-by-type'
import type { OriginalStackFrame } from '../../../shared/stack-frame'

type ErrorCauseProps = {
  cause: ReadyErrorCause
  dialogResizerRef: React.RefObject<HTMLDivElement | null>
}

interface SelectedFrameState {
  isIgnoreListOpen: boolean
  selectedFrameIndex: number | null
}

function getDefaultSelectedFrameState(
  frames: readonly OriginalStackFrame[]
): SelectedFrameState {
  const defaultIsIgnoreListOpen = false
  const defaultSelectedFrameIndex = frames.findIndex(
    (frame) => defaultIsIgnoreListOpen || !frame.ignored
  )

  return {
    isIgnoreListOpen: defaultIsIgnoreListOpen,
    selectedFrameIndex:
      defaultSelectedFrameIndex === -1 ? null : defaultSelectedFrameIndex,
  }
}

export function ErrorCause({ cause, dialogResizerRef }: ErrorCauseProps) {
  const frames = React.use(cause.frames())
  const trimmedMessage = cause.error.message.trim()

  const [{ isIgnoreListOpen, selectedFrameIndex }, dispatch] = useReducer(
    (
      prevState: SelectedFrameState,
      action:
        | { type: 'toggleIgnoreList' }
        | { type: 'selectFrame'; index: number }
    ) => {
      switch (action.type) {
        case 'toggleIgnoreList':
          const nextIsIgnoreListOpen = !prevState.isIgnoreListOpen
          const previouslySelectedFrameIndex = prevState.selectedFrameIndex
          if (nextIsIgnoreListOpen || previouslySelectedFrameIndex === null) {
            return {
              ...prevState,
              isIgnoreListOpen: nextIsIgnoreListOpen,
            }
          } else {
            if (frames[previouslySelectedFrameIndex].ignored) {
              for (let i = previouslySelectedFrameIndex - 1; i >= 0; i--) {
                if (!frames[i].ignored) {
                  return {
                    ...prevState,
                    selectedFrameIndex: i,
                    isIgnoreListOpen: nextIsIgnoreListOpen,
                  }
                }
              }
              for (
                let i = previouslySelectedFrameIndex + 1;
                i < frames.length;
                i++
              ) {
                if (!frames[i].ignored) {
                  return {
                    ...prevState,
                    selectedFrameIndex: i,
                    isIgnoreListOpen: nextIsIgnoreListOpen,
                  }
                }
              }

              return {
                ...prevState,
                selectedFrameIndex: null,
                isIgnoreListOpen: nextIsIgnoreListOpen,
              }
            } else {
              return {
                ...prevState,
                isIgnoreListOpen: nextIsIgnoreListOpen,
              }
            }
          }
        case 'selectFrame':
          return {
            ...prevState,
            selectedFrameIndex: action.index,
          }
        default:
          return prevState
      }
    },
    frames,
    getDefaultSelectedFrameState
  )

  const setIsIgnoreListOpen = useCallback(
    () => dispatch({ type: 'toggleIgnoreList' }),
    []
  )

  const selectedFrame =
    selectedFrameIndex !== null ? frames[selectedFrameIndex] : null

  const handleFrameSelect = useCallback(
    (index: number) => dispatch({ type: 'selectFrame', index }),
    []
  )

  const codeFrameTabGroupId = useId()

  return (
    <div data-nextjs-error-cause>
      <div className="error-cause-header">
        <span className="error-cause-label">
          Caused by: {cause.error.name || 'Error'}
        </span>
      </div>
      {trimmedMessage ? (
        <p className="error-cause-message">{trimmedMessage}</p>
      ) : null}

      {selectedFrameIndex !== null &&
        selectedFrame !== null &&
        selectedFrame.originalStackFrame &&
        selectedFrame.originalCodeFrame && (
          <CodeFrame
            stackFrame={selectedFrame.originalStackFrame}
            codeFrame={selectedFrame.originalCodeFrame}
            selectedFrameIndex={selectedFrameIndex}
            tabGroupId={codeFrameTabGroupId}
          />
        )}

      {frames.length > 0 && (
        <ErrorOverlayCallStack
          dialogResizerRef={dialogResizerRef}
          frames={frames}
          selectedFrameIndex={selectedFrameIndex}
          onFrameSelect={handleFrameSelect}
          isIgnoreListOpen={isIgnoreListOpen}
          setIsIgnoreListOpen={setIsIgnoreListOpen}
          tabGroupId={codeFrameTabGroupId}
        />
      )}

      {cause.cause && (
        <ErrorCause cause={cause.cause} dialogResizerRef={dialogResizerRef} />
      )}
    </div>
  )
}

export const styles = `
  [data-nextjs-error-cause] {
    border-top: 1px solid var(--color-gray-400);
    margin-top: 16px;
    padding-top: 16px;
  }

  .error-cause-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }

  .error-cause-label {
    padding: 2px 6px;
    margin: 0;
    border-radius: var(--rounded-md-2);
    background: var(--color-red-100);
    font-weight: 600;
    font-size: var(--size-12);
    color: var(--color-red-900);
    font-family: var(--font-stack-monospace);
    line-height: var(--size-20);
  }

  .error-cause-message {
    margin: 0;
    margin-left: 4px;
    color: var(--color-red-900);
    font-weight: 500;
    font-size: var(--size-16);
    letter-spacing: -0.32px;
    line-height: var(--size-24);
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }
`
