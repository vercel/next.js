'use client'

import { redirect } from 'next/navigation'
import React from 'react'

export default function Page() {
  const [shouldRedirect, setShouldRedirect] = React.useState(false)

  if (shouldRedirect) {
    redirect('/redirect/result')
  }
  return (
    <button
      onClick={() => React.startTransition(() => setShouldRedirect(true))}
    >
      Redirect!
    </button>
  )
}
