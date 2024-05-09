'use client'

import React from 'react'
import { ForbiddenBoundary, NotFoundBoundary } from './ui-errors-boundaries'

export function bailOnUIError(uiError: 'forbidden' | 'notFound') {
  throw new Error(`${uiError}() is not allowed to use in root layout`)
}

function NotAllowedRootNotFoundError() {
  bailOnUIError('notFound')
  return null
}

function NotAllowedRootForbiddenError() {
  bailOnUIError('forbidden')
  return null
}

export function DevRootUIErrorsBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ForbiddenBoundary uiComponent={<NotAllowedRootForbiddenError />}>
      <NotFoundBoundary uiComponent={<NotAllowedRootNotFoundError />}>
        {children}
      </NotFoundBoundary>
    </ForbiddenBoundary>
  )
}
