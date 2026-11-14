'use client'

import { useTransition } from 'react'
import { slowAction } from './actions'

export function Client() {
  const [pending, start] = useTransition()
  const tab = (t: string) => window.history.pushState(null, '', `?tab=${t}`)

  return (
    <>
      <button
        id="run-btn"
        disabled={pending}
        onClick={() => {
          start(async () => {
            await slowAction(1000)
          })
        }}
      >
        run
      </button>
      <button id="tab-a" onClick={() => tab('a')}>
        tab a
      </button>
      <button id="tab-b" onClick={() => tab('b')}>
        tab b
      </button>
      <p id="pending-status">{pending ? 'pending' : 'idle'}</p>
    </>
  )
}
