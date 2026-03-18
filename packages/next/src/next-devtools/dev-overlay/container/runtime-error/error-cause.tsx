import { useMemo } from 'react'
import React from 'react'
import { CodeFrame } from '../../components/code-frame/code-frame'
import { ErrorOverlayCallStack } from '../../components/errors/error-overlay-call-stack/error-overlay-call-stack'
import type { ReadyErrorCause } from '../../utils/get-error-by-type'

type ErrorCauseProps = {
  cause: ReadyErrorCause
  dialogResizerRef: React.RefObject<HTMLDivElement | null>
}

export function ErrorCause({ cause, dialogResizerRef }: ErrorCauseProps) {
  const frames = React.use(cause.frames())
  const trimmedMessage = cause.error.message.trim()

  const firstFrame = useMemo(() => {
    const index = frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )
    return frames[index] ?? null
  }, [frames])

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
