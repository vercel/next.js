import * as React from 'react'
import { StackFrame } from '../../StackFrame'
import { RuntimeErrorObject } from './index'

export type ResolvedRuntimeErrorsProps = {
  errors: ResolvedRuntimeError[]
}
export type ResolvedRuntimeError = {
  eventId: string
  error: Error
  frames: ResolvedStackFrame[]
}
export type ResolvedStackFrame =
  | { error: true; frame: StackFrame }
  | { external: true; frame: StackFrame }
  | {
      external: false
      collapsed: boolean
      original: StackFrame
      resolved: StackFrame
    }

async function getResolvedFrame(
  frame: StackFrame
): Promise<ResolvedStackFrame> {
  if (!frame.fileName?.startsWith('webpack-internal:///')) {
    const f: ResolvedStackFrame = { external: true, frame }
    return f
  }

  const params = new URLSearchParams()
  params.append('fileName', frame.fileName)
  params.append('lineNumber', String(frame.lineNumber))
  params.append('columnNumber', String(frame.columnNumber))
  return self
    .fetch(`/__nextjs_resolve-stack-frame?${params.toString()}`)
    .then(res => res.json())
    .then(body => {
      if (
        typeof body !== 'object' ||
        !('fileName' in body && 'lineNumber' in body && 'columnNumber' in body)
      ) {
        const f: ResolvedStackFrame = { external: true, frame }
        return f
      }
      const b: {
        fileName: unknown
        lineNumber: unknown
        columnNumber: unknown
      } = body
      const f: ResolvedStackFrame = {
        external: false,
        original: frame,
        collapsed:
          typeof b.fileName !== 'string' || b.fileName.includes('node_modules'),
        resolved: new StackFrame(
          frame.functionName,
          String(b.fileName),
          Number(b.lineNumber),
          Number(b.columnNumber)
        ),
      }
      return f
    })
}

export async function getResolvedRuntimeError(
  error: RuntimeErrorObject
): Promise<ResolvedRuntimeError> {
  const resolvedFrames: ResolvedStackFrame[] = await Promise.all(
    error.frames.map(frame =>
      getResolvedFrame(frame).then(
        frame => frame,
        () => {
          // This isn't shorthanded for TypeScript compatibility reasons:
          const f: ResolvedStackFrame = { error: true, frame }
          return f
        }
      )
    )
  )
  return { eventId: error.eventId, error: error.error, frames: resolvedFrames }
}

export const ResolvedRuntimeErrors: React.FC<ResolvedRuntimeErrorsProps> = function ResolvedRuntimeErrors({
  errors,
}) {
  const [idx, setIdx] = React.useState(0)

  const previous = React.useCallback(() => {
    setIdx(v => Math.max(0, v - 1))
  }, [setIdx])
  const next = React.useCallback(() => {
    setIdx(v => Math.min(v + 1, errors.length - 1))
  }, [setIdx, errors.length])

  // TODO: keyboard accessibility:
  // - arrow key navigation
  // - escape to minimize
  // - proper a11y for elements
  return (
    <div data-nextjs-dialog-overlay>
      <div data-nextjs-dialog-backdrop />
      <div
        data-nextjs-dialog-content
        tabIndex={-1}
        role="dialog"
        aria-labelledby="nextjs__runtime_errors"
        aria-modal="true"
      >
        <div data-nextjs-dialog-header className="error">
          <div>
            <nav>
              <button type="button" disabled={idx === 0} onClick={previous}>
                &larr;
              </button>
              <button
                type="button"
                disabled={idx === errors.length - 1}
                onClick={next}
              >
                &rarr;
              </button>
              &nbsp;
              <span>
                {idx + 1} of {errors.length} error{errors.length < 2 ? '' : 's'}{' '}
                on this page
              </span>
            </nav>
            <h4 id="nextjs__runtime_errors">{errors[idx].error.name}</h4>
            <p>{errors[idx].error.message}</p>
          </div>
          <button className="close" type="button" aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div data-nextjs-dialog-body>
          <p>...</p>
        </div>
      </div>
    </div>
  )
}
