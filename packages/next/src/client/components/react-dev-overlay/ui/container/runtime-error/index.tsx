import { useMemo } from 'react'
import { CodeFrame } from '../../components/code-frame/code-frame'
import { CallStack } from '../../components/errors/call-stack/call-stack'
import { PSEUDO_HTML_DIFF_STYLES } from './component-stack-pseudo-html'
import {
  useFrames,
  type ReadyRuntimeError,
} from '../../../utils/get-error-by-type'

export type RuntimeErrorProps = {
  error: ReadyRuntimeError
  dialogResizerRef: React.RefObject<HTMLDivElement | null>
}

export function RuntimeError({ error, dialogResizerRef }: RuntimeErrorProps) {
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

      {frames.length > 0 && (
        <CallStack dialogResizerRef={dialogResizerRef} frames={frames} />
      )}
    </>
  )
}

export const styles = `
  ${PSEUDO_HTML_DIFF_STYLES}
`
