import type { ReadyRuntimeError } from '../../helpers/get-error-by-type'

import { useMemo } from 'react'
import { CodeFrame } from '../../components/code-frame/code-frame'
import { CallStack } from '../../components/errors/call-stack/call-stack'
import { noop as css } from '../../helpers/noop-template'
import { PSEUDO_HTML_DIFF_STYLES } from './component-stack-pseudo-html'

export type RuntimeErrorProps = { error: ReadyRuntimeError }

export function RuntimeError({ error }: RuntimeErrorProps) {
  const { firstFrame } = useMemo(() => {
    const firstFirstPartyFrameIndex = error.frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )

    return {
      firstFrame: error.frames[firstFirstPartyFrameIndex] ?? null,
    }
  }, [error.frames])

  return (
    <>
      {firstFrame && (
        <CodeFrame
          stackFrame={firstFrame.originalStackFrame!}
          codeFrame={firstFrame.originalCodeFrame!}
        />
      )}

      {error.frames.length > 0 && <CallStack frames={error.frames} />}
    </>
  )
}

export const styles = css`
  ${PSEUDO_HTML_DIFF_STYLES}
`
