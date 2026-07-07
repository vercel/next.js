import { Suspense } from 'react'
import { ClientComponent } from './client'

// This page is only for manual performance profiling of the debug channel
// persistence (it streams a large amount of debug data). It is not used by any
// end-to-end test.
async function Home() {
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) =>
      setTimeout(() => resolve('a'.repeat(1_000_000)))
    )
  }

  return (
    <div>
      <h2>Large Debug Data</h2>
      <ClientComponent />
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Home />
    </Suspense>
  )
}
