'use client'

import { notFound } from 'next/dist/client/components/not-found'
import React from 'react'

export default function Page() {
  const [notFoundEnabled, enableNotFound] = React.useState(false)

  if (notFoundEnabled) {
    notFound()
  }
  return (
    <button onClick={() => React.startTransition(() => enableNotFound(true))}>
      Not Found!
    </button>
  )
}
