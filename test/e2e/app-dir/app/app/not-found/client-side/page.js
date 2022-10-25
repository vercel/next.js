'use client'

import { NotFound } from 'next/navigation'
import React from 'react'

export default function Page() {
  const [notFoundEnabled, enableNotFound] = React.useState(false)

  if (notFoundEnabled) {
    throw new NotFound()
  }
  return (
    <button onClick={() => React.startTransition(() => enableNotFound(true))}>
      Not Found!
    </button>
  )
}
