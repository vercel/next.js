import * as React from 'react'
import { CodeFrame } from '../components/CodeFrame'
import { noop as css } from '../helpers/noop-template'
import { OriginalStackFrame } from '../helpers/stack-frame'
import { ReadyRuntimeError } from './Errors'

export type RuntimeErrorProps = { className?: string; error: ReadyRuntimeError }

const RuntimeError: React.FC<RuntimeErrorProps> = function RuntimeError({
  className,
  error,
}) {
  const firstFirstPartyFrameIndex = React.useMemo<number>(() => {
    return error.frames.findIndex(
      entry =>
        entry.expanded &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )
  }, [error.frames])
  const firstFrame = React.useMemo<OriginalStackFrame | null>(() => {
    return error.frames[firstFirstPartyFrameIndex] ?? null
  }, [error.frames, firstFirstPartyFrameIndex])
  // const leadingFrames = React.useMemo<OriginalStackFrame[]>(
  //   () =>
  //     firstFirstPartyFrameIndex < 0
  //       ? []
  //       : error.frames.slice(0, firstFirstPartyFrameIndex),
  //   [error.frames, firstFirstPartyFrameIndex]
  // )

  return (
    <div className={className}>
      {firstFrame ? (
        <React.Fragment>
          <h5>Source</h5>
          <CodeFrame
            stackFrame={firstFrame.originalStackFrame}
            codeFrame={firstFrame.originalCodeFrame}
          />
        </React.Fragment>
      ) : (
        undefined
      )}
    </div>
  )
}

export const styles = css``

export { RuntimeError }
