'use client'

import dynamic from 'next/dynamic'

// The import never resolves on the server. This emulates the usual case of a
// real chunk that is not loaded yet when the static shell is flushed.
const Heavy = dynamic(
  async () => {
    if (typeof window === 'undefined') {
      await new Promise(() => {})
    }
    return import('../heavy')
  },
  { loading: () => null }
)

export function Shell() {
  return (
    <main>
      <p id="shell">shell</p>
      <Heavy />
    </main>
  )
}
