'use client'

import { action1 } from 'server-action-mod'

export default function Page() {
  return (
    <button
      id="action"
      onClick={() => {
        action1()
      }}
    >
      action
    </button>
  )
}
