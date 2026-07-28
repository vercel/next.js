'use client'

import type { ReactNode } from 'react'

// Renders exactly one of the two slots it was handed. Both slots are
// serialized into this component's props, so which one actually renders
// is only observable by executing this component during an SSR pass —
// the server payload alone cannot reveal the outcome.
export function ClientAuthFork({
  isLoggedIn,
  loggedInUI,
  loggedOutUI,
}: {
  isLoggedIn: boolean
  loggedInUI: ReactNode
  loggedOutUI: ReactNode
}) {
  if (isLoggedIn) {
    return <section data-branch="children">{loggedInUI}</section>
  }
  return <section data-branch="login">{loggedOutUI}</section>
}
