'use client'

import { longAction } from './actions'

export default function Page() {
  return (
    <button
      id="start"
      onClick={() => {
        // Fire the action; the promise stays pending until the action resolves
        // or the request is aborted by disconnecting.
        longAction()
      }}
    >
      start
    </button>
  )
}
