'use client'

import { notFound } from 'next/navigation'
import { useState } from 'react'

export default function Page() {
  const [trigger, setTrigger] = useState(false)

  if (trigger) {
    notFound()
  }

  return (
    <div>
      <h1 id="page-title">Client Trigger Not Found Page</h1>
      <button id="trigger-not-found" onClick={() => setTrigger(true)}>
        Trigger Not Found
      </button>
    </div>
  )
}
