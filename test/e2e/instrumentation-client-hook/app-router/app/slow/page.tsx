import { connection } from 'next/server'
import { Suspense } from 'react'

async function SlowContent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return <p id="slow-content">Slow content</p>
}

export default function Page() {
  return (
    <>
      <h1 id="slow-shell">Slow page</h1>
      <Suspense fallback={<p id="slow-fallback">Loading</p>}>
        <SlowContent />
      </Suspense>
    </>
  )
}
