import { useMemo } from 'react'
import React from 'react'
import { CodeFrame } from '../../components/code-frame/code-frame'
import { ErrorOverlayCallStack } from '../../components/errors/error-overlay-call-stack/error-overlay-call-stack'
import { ErrorCause } from './error-cause'
import { HotlinkedText } from '../../components/hot-linked-text'
import type { ReadyErrorCause } from '../../utils/get-error-by-type'

interface ErrorAggregateErrorsProps {
  errors: ReadyErrorCause[]
  dialogResizerRef: React.RefObject<HTMLDivElement | null>
}

export function ErrorAggregateErrors({
  errors,
  dialogResizerRef,
}: ErrorAggregateErrorsProps) {
  return (
    // TODO: Wrap in SuspenseList
    <>
      {errors.map((entry, index) => (
        <ErrorAggregateEntry
          key={index}
          entry={entry}
          index={index}
          total={errors.length}
          dialogResizerRef={dialogResizerRef}
        />
      ))}
    </>
  )
}

interface ErrorAggregateEntryProps {
  entry: ReadyErrorCause
  index: number
  total: number
  dialogResizerRef: React.RefObject<HTMLDivElement | null>
}

function ErrorAggregateEntry({
  entry,
  index,
  total,
  dialogResizerRef,
}: ErrorAggregateEntryProps) {
  const frames = React.use(entry.frames())
  const trimmedMessage = entry.error.message.trim()

  const firstFrame = useMemo(() => {
    const idx = frames.findIndex(
      (f) =>
        !f.ignored &&
        Boolean(f.originalCodeFrame) &&
        Boolean(f.originalStackFrame)
    )
    return frames[idx] ?? null
  }, [frames])

  return (
    <div data-nextjs-error-aggregate-error>
      <div className="error-aggregate-error-header">
        <span className="error-aggregate-error-label">
          {index + 1} of {total}: {entry.error.name || 'Error'}
        </span>
      </div>
      {trimmedMessage ? (
        <p className="error-aggregate-error-message">
          <HotlinkedText text={trimmedMessage} />
        </p>
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

      {entry.cause && (
        <ErrorCause cause={entry.cause} dialogResizerRef={dialogResizerRef} />
      )}

      {'aggregateErrors' in entry && entry.aggregateErrors !== null && (
        <ErrorAggregateErrors
          errors={entry.aggregateErrors}
          dialogResizerRef={dialogResizerRef}
        />
      )}
    </div>
  )
}

export const styles = `
  [data-nextjs-error-aggregate-error] {
    border-top: 1px solid var(--color-gray-400);
    margin-top: 16px;
    padding-top: 16px;
  }

  .error-aggregate-error-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }

  .error-aggregate-error-label {
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

  .error-aggregate-error-message {
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
