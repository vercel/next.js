'use client'
import { useActionState } from 'react'
import { updateTagAndReturn } from './actions'

export default function Page() {
  const [state, formAction, isPending] = useActionState(updateTagAndReturn, {
    success: false,
    timestamp: '',
    cachedTimestamp: '',
  })

  return (
    <div>
      <p id="cached-timestamp">{state.cachedTimestamp}</p>
      <p id="action-result">
        {state.success
          ? `success: true, timestamp: ${state.timestamp}`
          : 'no result yet'}
      </p>
      <p id="pending">{isPending ? 'pending' : 'idle'}</p>
      <form action={formAction}>
        <button id="update-and-return" type="submit">
          Update Tag and Return
        </button>
      </form>
    </div>
  )
}
