'use client'

import React from 'react'
import { HTTPErrorFallbackBoundary } from './http-error-fallback-boundary'

export function bailOnRootNotFound() {
  throw new Error('notFound() is not allowed to use in root layout')
}

function NotAllowedRootHTTPFallbackError() {
  bailOnRootNotFound()
  return null
}

export function DevRootHTTPErrorFallbackBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <HTTPErrorFallbackBoundary
      notFound={[<NotAllowedRootHTTPFallbackError />, null]}
    >
      {children}
    </HTTPErrorFallbackBoundary>
  )
}
