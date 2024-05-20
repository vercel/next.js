'use client'

import React from 'react'
import { ForbiddenBoundary, NotFoundBoundary } from './ui-errors-boundaries'
import type { UIErrorHelper } from '../../shared/lib/ui-error-types'

export function bailOnUIError(uiError: UIErrorHelper) {
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
