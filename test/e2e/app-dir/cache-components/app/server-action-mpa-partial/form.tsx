'use client'

import { useActionState } from 'react'
import { action, revalidatingAction } from './action'

export function ActionForm() {
  const [result, formAction] = useActionState(action, 'initial')
  const [revalidationResult, revalidationFormAction] = useActionState(
    revalidatingAction,
    'initial'
  )

  return (
    <>
      <form action={formAction}>
        <button id="submit-button">Submit</button>
        <p id="action-state">{result}</p>
      </form>
      <form action={revalidationFormAction}>
        <button id="revalidate-button">Revalidate</button>
        <p id="revalidation-state">{revalidationResult}</p>
      </form>
    </>
  )
}
