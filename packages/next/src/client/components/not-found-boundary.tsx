'use client'

import React from 'react'
import { isNotFoundError } from './not-found'
import { UIErrorBoundaryWrapper } from './ui-error-boundary'
import type { UIErrorBoundaryWrapperProps } from './ui-error-boundary'

type NotFoundBoundaryProps = Pick<
  UIErrorBoundaryWrapperProps,
  'uiComponent' | 'uiComponentStyles' | 'children'
>

export function NotFoundBoundary(props: NotFoundBoundaryProps) {
  return (
    <UIErrorBoundaryWrapper
      nextError={'not-found'}
      matcher={isNotFoundError}
      {...props}
    />
  )
}
