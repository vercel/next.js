import { connection } from 'next/server'
import { Suspense } from 'react'
import { Shell } from './shell'

async function DynamicBoundary() {
  await connection()
  return <p id="dynamic">Request-time content</p>
}

export default function Page() {
  return (
    <main>
      <Shell />
      <Suspense fallback={<p id="large-fallback">Loading large boundary</p>}>
        <p id="large">{'Large static boundary. '.repeat(2000)}</p>
      </Suspense>
      <Suspense
        fallback={<p id="dynamic-fallback">Loading dynamic boundary</p>}
      >
        <DynamicBoundary />
      </Suspense>
    </main>
  )
}
