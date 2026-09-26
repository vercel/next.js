import { Suspense } from 'react'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <Inner />
      </Suspense>
    </main>
  )
}

async function Inner() {
  // Simulate tasky IO
  await new Promise((resolve) => setTimeout(resolve))
  return <p>Uncached data</p>
}
