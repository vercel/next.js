'use client'

import { inc } from '../client/actions'

export default function Page() {
  return (
    <div>
      <h1>Middleware Redirect Action</h1>
      <button
        id="trigger-action"
        onClick={async () => {
          await inc(0)
        }}
      >
        Trigger Action
      </button>
    </div>
  )
}
