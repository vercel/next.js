'use client'

import React from 'react'
import { HTTPAccessFallbackBoundary } from './http-access-fallback/error-boundary'

// TODO: error on using forbidden and unauthorized in root layout
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
