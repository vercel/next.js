'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
  //^^^ fine because it's the special reset prop in an error file
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
