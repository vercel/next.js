import { Suspense } from 'react'
import { connection } from 'next/server'

// No config on the page itself — the `instant = false` opt-out comes from the
// parent layout and should still suppress the warning.
export default function Page() {
  return (
    <main>
      <div id="static-content">Layout-instant-false static</div>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Layout-instant-false dynamic</div>
}
