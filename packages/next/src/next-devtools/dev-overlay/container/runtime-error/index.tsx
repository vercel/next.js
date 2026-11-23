import { useMemo } from 'react'
import { CodeFrame } from '../../components/code-frame/code-frame'
import { ErrorOverlayCallStack } from '../../components/errors/error-overlay-call-stack/error-overlay-call-stack'
import { PSEUDO_HTML_DIFF_STYLES } from './component-stack-pseudo-html'
import { ErrorCause, styles as errorCauseStyles } from './error-cause'
import {
  ErrorAggregateErrors,
  styles as errorAggregateErrorsStyles,
} from './error-aggregate-errors'
import {
  useFrames,
  type ReadyRuntimeError,
} from '../../utils/get-error-by-type'

type RuntimeErrorProps = {
  error: ReadyRuntimeError
}

export function RuntimeError({ error }: RuntimeErrorProps) {
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

  return (
    <>
      {firstFrame && (
        <CodeFrame
          stackFrame={firstFrame.originalStackFrame!}
          codeFrame={firstFrame.originalCodeFrame!}
        />
      )}

      {frames.length > 0 && <ErrorOverlayCallStack frames={frames} />}

      {error.cause && <ErrorCause cause={error.cause} />}

      {'aggregateErrors' in error && error.aggregateErrors !== null && (
        <ErrorAggregateErrors errors={error.aggregateErrors} />
      )}
    </>
  )
}

export const styles = `
  ${PSEUDO_HTML_DIFF_STYLES}
  ${errorCauseStyles}
  ${errorAggregateErrorsStyles}
`
