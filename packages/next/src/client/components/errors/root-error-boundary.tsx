'use client'

import React, { type JSX } from 'react'
import GracefulDegradeBoundary from './graceful-degrade-boundary'
import { ErrorBoundary, type ErrorBoundaryProps } from '../error-boundary'
import { isBot } from '../../../shared/lib/router/utils/is-bot'

const isBotUserAgent =
  typeof window !== 'undefined' && isBot(window.navigator.userAgent)

export default function RootErrorBoundary({
  children,
  errorComponent,
  errorStyles,
  errorScripts,
}: ErrorBoundaryProps & { children: React.ReactNode }): JSX.Element {
  if (isBotUserAgent) {
    // Preserve existing DOM/HTML for bots to avoid replacing content with an error UI
    // and to keep the original SSR output intact.
    return <GracefulDegradeBoundary>{children}</GracefulDegradeBoundary>
  }

  return (
    <ErrorBoundary
      errorComponent={errorComponent}
      errorStyles={errorStyles}
      errorScripts={errorScripts}
    >
      {children}
    </ErrorBoundary>
  )
}
