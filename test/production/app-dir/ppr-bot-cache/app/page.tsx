import React, { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicSection() {
  await connection()
  return <div id="dynamic-content">Dynamic content: {Date.now()}</div>
}

export default function Page() {
  return (
    <div>
      <h1 id="static-shell">Static Shell Header</h1>
      <Suspense fallback={<div id="loading">Loading dynamic section...</div>}>
        <DynamicSection />
      </Suspense>
    </div>
  )
}
