'use client'

import { forbidden } from 'next/navigation'
import React from 'react'

export default function Page() {
  const [forbiddenEnabled, enableForbidden] = React.useState(false)

  if (forbiddenEnabled) {
    forbidden()
  }
  return (
    <button onClick={() => React.startTransition(() => enableForbidden(true))}>
      Forbidden!
    </button>
  )
}
