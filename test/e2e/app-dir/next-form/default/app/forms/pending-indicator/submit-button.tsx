'use client'
import * as ReactDOM from 'react-dom'

export function SubmitButton() {
  const { pending } = ReactDOM.useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Submitting...' : 'Submit'}
    </button>
  )
}
