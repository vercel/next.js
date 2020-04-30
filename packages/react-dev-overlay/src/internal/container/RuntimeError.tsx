import * as React from 'react'
import { StackFrame } from 'stacktrace-parser'
import { CodeFrame } from '../components/CodeFrame'
import { noop as css } from '../helpers/noop-template'
import { getFrameSource, OriginalStackFrame } from '../helpers/stack-frame'
import { ReadyRuntimeError } from './Errors'

export type RuntimeErrorProps = { className?: string; error: ReadyRuntimeError }

const CallStackFrame: React.FC<{
  frame: OriginalStackFrame
}> = function CallStackFrame({ frame }) {
  // TODO: ability to expand resolved frames
  // TODO: render error or external indicator

  const f: StackFrame = frame.originalStackFrame ?? frame.sourceStackFrame
  return (
    <div data-nextjs-call-stack-frame>
      <h6>{f.methodName}</h6>
      <p>{getFrameSource(f)}</p>
    </div>
  )
}

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

  const allLeadingFrames = React.useMemo<OriginalStackFrame[]>(
    () =>
      firstFirstPartyFrameIndex < 0
        ? []
        : error.frames.slice(0, firstFirstPartyFrameIndex),
    [error.frames, firstFirstPartyFrameIndex]
  )

  // FIXME: allow collapsed frames to be toggled
  const [all] = React.useState(false)
  const leadingFrames = React.useMemo(
    () => allLeadingFrames.filter(f => f.expanded || all),
    [all, allLeadingFrames]
  )
  const callStackFrames = React.useMemo(
    () =>
      error.frames
        .slice(firstFirstPartyFrameIndex + 1)
        .filter(f => f.expanded || all),
    [all, error.frames, firstFirstPartyFrameIndex]
  )

  return (
    <div className={className}>
      {firstFrame ? (
        <React.Fragment>
          <h5>Source</h5>
          {leadingFrames.map((frame, index) => (
            <CallStackFrame
              key={`leading-frame-${index}-${all}`}
              frame={frame}
            />
          ))}
          <CodeFrame
            stackFrame={firstFrame.originalStackFrame}
            codeFrame={firstFrame.originalCodeFrame}
          />
        </React.Fragment>
      ) : (
        undefined
      )}
      {callStackFrames.length ? (
        <React.Fragment>
          <h5>Call Stack</h5>
          {callStackFrames.map((frame, index) => (
            <CallStackFrame key={`call-stack-${index}-${all}`} frame={frame} />
          ))}
        </React.Fragment>
      ) : (
        undefined
      )}
    </div>
  )
}

export const styles = css`
  [data-nextjs-call-stack-frame] > h6 {
    font-family: var(--font-stack-monospace);
    color: rgba(25, 25, 25, 1);
  }
  [data-nextjs-call-stack-frame] > p {
    padding-left: 0.75rem;
    font-size: 0.875rem;
    color: rgba(25, 25, 25, 0.5);
  }
`

export { RuntimeError }
