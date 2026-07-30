import { connection } from 'next/server'
import { Suspense } from 'react'

import { theme } from '../variants'

// Reading a variant while prerendering is not supported yet, so the read is
// kept at request time: `connection()` defers it, and the boundary lets the
// rest of the route prerender. Remove both once static generation supports
// variants.
async function Theme() {
  await connection()

  return <p id="theme">{await theme()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Theme />
    </Suspense>
  )
}
