'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
  unstable_retry,
  //^^^ `reset` and `unstable_retry` are fine because they are the special
  // framework-injected function props in an error file
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
      <button onClick={() => unstable_retry()}>Retry</button>
    </div>
  )
}
