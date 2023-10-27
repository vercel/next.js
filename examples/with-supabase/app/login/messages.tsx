'use client'

import { useSearchParams } from 'next/navigation'

export default function Messages() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const message = searchParams.get('message')
  return (
    <>
      {error && (
        <p className="mt-4 p-4 bg-foreground/10 text-foreground text-center">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-4 p-4 bg-foreground/10 text-foreground text-center">
          {message}
        </p>
      )}
    </>
  )
}
