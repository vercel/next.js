'use client'
import { useActionState } from 'react'
import { refreshOnly, updateTagAndRefresh, refreshWithReturn } from './actions'

export function RefreshClient() {
  const [state, formAction, isPending] = useActionState(refreshWithReturn, {
    refreshed: false,
    timestamp: '',
    cachedTimestamp: '',
  })

  return (
    <div>
      <p id="action-result">
        {state.refreshed
          ? `refreshed: true, timestamp: ${state.timestamp}`
          : 'no result yet'}
      </p>
      <p id="pending">{isPending ? 'pending' : 'idle'}</p>
      <form>
        <button id="refresh-only" formAction={refreshOnly} type="submit">
          Refresh Only
        </button>
        <button
          id="update-and-refresh"
          formAction={updateTagAndRefresh}
          type="submit"
        >
          Update Tag and Refresh
        </button>
        <button id="refresh-with-return" formAction={formAction} type="submit">
          Refresh With Return
        </button>
      </form>
    </div>
  )
}
