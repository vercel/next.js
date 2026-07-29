'use client'

import type { ReactNode } from 'react'

// Burns CPU synchronously before rendering its branch, so any SSR pass of
// this component takes well over a millisecond. Used by the
// mount-observation timeout test, which lowers the observation timeout via
// NEXT_TEST_MOUNT_OBSERVATION_TIMEOUT_MS so the observation render is
// guaranteed to exceed it. Fixed iterations rather than a clock so no
// sync-IO API (Date.now etc.) is involved.
function burnCpu() {
  let acc = 0
  for (let i = 0; i < 50_000_000; i++) {
    acc = (acc + i) % 1_000_000_007
  }
  return acc
}

export function SlowClientAuthFork({
  isLoggedIn,
  loggedInUI,
  loggedOutUI,
}: {
  isLoggedIn: boolean
  loggedInUI: ReactNode
  loggedOutUI: ReactNode
}) {
  const burned = burnCpu()
  if (isLoggedIn) {
    return (
      <section data-branch="children" data-burned={burned}>
        {loggedInUI}
      </section>
    )
  }
  return (
    <section data-branch="login" data-burned={burned}>
      {loggedOutUI}
    </section>
  )
}
