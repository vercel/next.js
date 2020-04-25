import * as React from 'react'
import { StackFrame } from '../StackFrame'

export type RuntimeErrorObject = {
  eventId: string
  error: Error
  frames: StackFrame[]
}
export type RuntimeErrorsProps = { errors: RuntimeErrorObject[] }

export const RuntimeErrors: React.FC<RuntimeErrorsProps> = function RuntimeErrors({
  errors,
}) {
  const [idx, setIdx] = React.useState(0)

  const previous = React.useCallback(() => {
    setIdx(v => Math.max(0, v - 1))
  }, [setIdx])
  const next = React.useCallback(() => {
    setIdx(v => Math.min(v + 1, errors.length - 1))
  }, [setIdx, errors.length])

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
