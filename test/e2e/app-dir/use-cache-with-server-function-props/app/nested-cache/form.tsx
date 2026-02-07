'use client'

import { useActionState } from 'react'

export function Form({
  getDate,
  getRandom,
}: {
  getDate: () => Promise<string>
  getRandom: () => Promise<number>
}) {
  const [date, formAction, isDatePending] = useActionState(getDate, null)

  const [random, buttonAction, isRandomPending] = useActionState(
    getRandom,
    null
  )

  return (
    <form action={formAction}>
      <button id="submit-button-date">Get Date</button>{' '}
      <button id="submit-button-random" formAction={buttonAction}>
        Get Random
      </button>
      <p id="date">{isDatePending ? 'loading...' : date}</p>
      <p id="random">{isRandomPending ? 'loading...' : random}</p>
    </form>
  )
}
