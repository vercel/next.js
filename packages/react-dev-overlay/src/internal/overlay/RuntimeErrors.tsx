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
  console.log('Runtime errors:', errors)
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
            <h4 id="nextjs__runtime_errors">{errors[0].error.name}</h4>
            <p>{errors[0].error.message}</p>
          </div>
          <button type="button" aria-label="Close">
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
