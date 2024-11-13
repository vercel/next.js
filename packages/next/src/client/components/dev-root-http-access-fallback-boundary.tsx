'use client'

import React from 'react'
import { HTTPAccessFallbackBoundary } from './http-access-fallback/error-boundary'

export function bailOnRootNotFound() {
  throw new Error('notFound() is not allowed to use in root layout')
}

function NotAllowedRootHTTPFallbackError() {
  bailOnRootNotFound()
  return null
}

export function DevRootHTTPAccessFallbackBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <HTTPAccessFallbackBoundary notFound={<NotAllowedRootHTTPFallbackError />}>
      {children}
    </HTTPAccessFallbackBoundary>
  )
}
