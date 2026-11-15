'use client'

import { ErrorState } from '@/components/error-state'
import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="h-screen flex bg-background">
      <ErrorState error={error} onRetry={reset} />
    </main>
  )
}
