import { Suspense } from 'react'
import { connection } from 'next/server'
import { unstable_navigation } from 'next/cache'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ searchParams: { q: 'test' } }],
}

export default function Page() {
  return (
    <div>
      <p id="static-content">Static content</p>
      <Suspense fallback={<p id="dynamic-fallback">Loading dynamic...</p>}>
        <DynamicWithNavigation />
      </Suspense>
    </div>
  )
}

async function DynamicWithNavigation() {
  await connection()
  await unstable_navigation()
  return <p id="dynamic-content">Dynamic content after navigation()</p>
}
