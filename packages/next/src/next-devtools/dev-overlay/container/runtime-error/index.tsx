import { useMemo } from 'react'
import { CodeFrame } from '../../components/code-frame/code-frame'
import { ErrorOverlayCallStack } from '../../components/errors/error-overlay-call-stack/error-overlay-call-stack'
import { PSEUDO_HTML_DIFF_STYLES } from './component-stack-pseudo-html'
import { ErrorCause, styles as errorCauseStyles } from './error-cause'
import { MAX_CAUSE_DEPTH, useFrames } from '../../utils/get-error-by-type'
import type { SupportedErrorEvent } from './render-error'

type RuntimeErrorProps = {
  error: SupportedErrorEvent
  dialogResizerRef: React.RefObject<HTMLDivElement | null>
}

export function RuntimeError({
  error: { error },
  dialogResizerRef,
}: RuntimeErrorProps) {
  const frames = useFrames(
    error,
    // TODO: where did this come from?
    true
  )

  const firstFrame = useMemo(() => {
    const firstFirstPartyFrameIndex = frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )

    return frames[firstFirstPartyFrameIndex] ?? null
  }, [frames])

  const cause = error.cause

  return (
    <>
      {firstFrame && (
        <CodeFrame
          stackFrame={firstFrame.originalStackFrame!}
          codeFrame={firstFrame.originalCodeFrame!}
        />
      )}

      {frames.length > 0 && (
        <ErrorOverlayCallStack
          dialogResizerRef={dialogResizerRef}
          frames={frames}
        />
      )}

      {cause instanceof Error && (
        <ErrorCause
          error={cause}
          dialogResizerRef={dialogResizerRef}
          depth={1}
          maxDepth={MAX_CAUSE_DEPTH}
        />
      )}
    </>
  )
}

export const styles = `
  ${PSEUDO_HTML_DIFF_STYLES}
  ${errorCauseStyles}
`
