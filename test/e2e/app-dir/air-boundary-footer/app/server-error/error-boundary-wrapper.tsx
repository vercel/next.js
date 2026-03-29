'use client'
import type { ErrorInfo } from 'next/error'
import { unstable_catchError } from 'next/error'

export function ErrorFallback(props: {}, { error }: ErrorInfo) {
  return <p id="error-boundary-message">{error.message}</p>
}

export default unstable_catchError(ErrorFallback)
