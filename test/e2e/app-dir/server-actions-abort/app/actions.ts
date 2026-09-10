'use server'

import { unstable_requestSignal } from 'next/server'
import { getState } from './state'

// Simulates a long-running server action (like the issue's `setTimeout(60000)`)
// that observes the request's abort signal so it can stop early when the client
// disconnects, instead of running to completion.
export async function longAction() {
  const state = getState()
  state.started = true

  const signal = unstable_requestSignal()

  if (signal.aborted) {
    state.aborted = true
    return
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      state.completed = true
      resolve()
    }, 10000)

    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      state.aborted = true
      resolve()
    })
  })
}
