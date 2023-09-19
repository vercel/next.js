'use client'

import { experimental_useFormStatus as useFormStatus } from 'react-dom'

export function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button disabled={pending} type="submit">
      {pending ? 'Adding...' : 'Add'}
    </button>
  )
}
