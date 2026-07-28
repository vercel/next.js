'use client'

import { catchError, type ErrorInfo } from 'next/error'

type BrowserOnlyErrorBoundaryProps = {
  fallbackId: string
}

function BrowserOnlyErrorFallback(
  { fallbackId }: BrowserOnlyErrorBoundaryProps,
  errorInfo: ErrorInfo
) {
  return <p id={fallbackId}>{String(errorInfo.error)}</p>
}

export const BrowserOnlyErrorBoundary = catchError(BrowserOnlyErrorFallback)
