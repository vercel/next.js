'use client'
import type { ErrorInfo } from 'next/error'
import { unstable_catchError } from 'next/error'

export function ErrorFallback(_props: {}, { error }: ErrorInfo) {
  return <div id="error-boundary-message">{error.message}</div>
}

export default unstable_catchError(ErrorFallback)
