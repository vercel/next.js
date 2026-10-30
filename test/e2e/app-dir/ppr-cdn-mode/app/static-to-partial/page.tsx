import { Suspense } from 'react'
import { connection } from 'next/server'
import { getMode } from './mode'

// Fully static at build. Once POST /static-to-partial/mode switches the mode
// file, the next render has a hole, and switching it back removes the hole.
export default async function Page() {
  const { partial } = await getMode()
  return (
    <main>
      <h1 id="heading">Static to partial</h1>
      <p id="mode">{partial ? 'partial' : 'static'}</p>
      {partial ? (
        <Suspense fallback={<p id="fallback">Loading…</p>}>
          <Now />
        </Suspense>
      ) : null}
    </main>
  )
}

async function Now() {
  await connection()
  return <p id="dynamic">Now: {Date.now()}</p>
}
