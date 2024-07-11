'use client'

import React from 'react'
import { NotFoundBoundary } from './not-found-boundary'

export function bailOnNotFound() {
  throw new Error('notFound() is not allowed to use in root layout')
}

function NotAllowedRootNotFoundError() {
  bailOnNotFound()
  return null
}

export function DevRootNotFoundBoundary({
  children,
  missingSlots,
}: {
  children: React.ReactNode
  missingSlots?: Set<string>
}) {
  return (
    <NotFoundBoundary
      notFound={<NotAllowedRootNotFoundError />}
      missingSlots={missingSlots}
    >
      {children}
    </NotFoundBoundary>
  )
}
