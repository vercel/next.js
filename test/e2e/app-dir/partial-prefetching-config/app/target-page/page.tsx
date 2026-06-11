import { Suspense } from 'react'
import { connection } from 'next/server'

export default function Page() {
  return (
    <main>
      <div id="static-content">Static content</div>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return (
    <div id="dynamic-content">Dynamic content {new Date().toISOString()}</div>
  )
}
