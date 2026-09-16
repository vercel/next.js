import React, { Suspense } from 'react'
import { connection } from 'next/server'

async function SlowDynamicHole() {
  await connection()
  return <div id="dynamic-content">Dynamic rendered: {Date.now()}</div>
}

export default function Page() {
  return (
    <main>
      <h1 id="static-title">Pre-rendered Static Shell</h1>
      <p id="static-desc">This part was prerendered at build time.</p>
      <Suspense fallback={<div id="fallback">Loading dynamic content...</div>}>
        <SlowDynamicHole />
      </Suspense>
    </main>
  )
}
