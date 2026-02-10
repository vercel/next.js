import { useCallback, useId, useReducer } from 'react'
import { CodeFrame } from '../../components/code-frame/code-frame'
import { ErrorOverlayCallStack } from '../../components/errors/error-overlay-call-stack/error-overlay-call-stack'
import { PSEUDO_HTML_DIFF_STYLES } from './component-stack-pseudo-html'
import { ErrorCause, styles as errorCauseStyles } from './error-cause'
import {
  useFrames,
  type ReadyRuntimeError,
} from '../../utils/get-error-by-type'

type RuntimeErrorProps = {
  error: ReadyRuntimeError
  dialogResizerRef: React.RefObject<HTMLDivElement | null>
}

interface SelectedFrameState {
  isIgnoreListOpen: boolean
  selectedFrameIndex: number | null
}

function getDefaultSelectedFrameState(
  frames: ReturnType<typeof useFrames>
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

export function RuntimeError({ error, dialogResizerRef }: RuntimeErrorProps) {
  const frames = useFrames(error)
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
            // When we show ignore-listed, the current selected frame is still visible.
            // No need to change the index
            return {
              ...prevState,
              isIgnoreListOpen: nextIsIgnoreListOpen,
            }
          } else {
            // The selected frame may have been hidden, find the next best one.
            if (frames[previouslySelectedFrameIndex].ignored) {
              // prefer a frame closer to the callsite
              for (let i = previouslySelectedFrameIndex - 1; i >= 0; i--) {
                if (!frames[i].ignored) {
                  return {
                    ...prevState,
                    selectedFrameIndex: i,
                    isIgnoreListOpen: nextIsIgnoreListOpen,
                  }
                }
              }
              // fallback to a deeper one
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

              // Found no suitable frame to select e.g. all frames are ignore-listed
              // or there are no frames at all.
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
    <>
      {selectedFrame !== null &&
        selectedFrame.originalStackFrame &&
        selectedFrame.originalCodeFrame && (
          <CodeFrame
            stackFrame={selectedFrame.originalStackFrame}
            codeFrame={selectedFrame.originalCodeFrame}
            selectedFrameIndex={selectedFrameIndex!}
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

      {error.cause && (
        <ErrorCause cause={error.cause} dialogResizerRef={dialogResizerRef} />
      )}
    </>
  )
}

export const styles = `
  ${PSEUDO_HTML_DIFF_STYLES}
  ${errorCauseStyles}
`
