'use client'

import { useFormStatus } from 'react-dom'
import revalidate from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      className="revalidate-from-button"
      type="submit"
      aria-disabled={pending}
    >
      Revalidate
    </button>
  )
}

export function RevalidateFrom() {
  return (
    <form className="revalidate-from" action={revalidate}>
      <SubmitButton />
    </form>
  )
}
