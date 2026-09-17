import { Suspense } from 'react'
import { connection } from 'next/server'

// React records every element that encloses a postponed boundary as a replay
// node in the postponed state, and copies its `key` in verbatim. So `label`
// decides whether the postponed state is pure ASCII or carries a multi-byte
// character.
export function KeyedBoundary({ label }) {
  return (
    <ul>
      <li key={label}>
        <Suspense fallback={null}>
          <Dynamic />
        </Suspense>
      </li>
    </ul>
  )
}

async function Dynamic() {
  await connection()
  return <span id="resumed">resumed</span>
}
