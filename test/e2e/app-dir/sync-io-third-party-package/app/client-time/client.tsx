'use client'

import { BlockingWidget } from 'external-time'

export function Client() {
  return (
    // The time differs between server and client. Only the sync IO error matters here.
    <p suppressHydrationWarning>
      <BlockingWidget />
    </p>
  )
}
