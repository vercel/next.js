'use client'

import React from 'react'

import {
  UIErrorBoundaryWrapper,
  type UIErrorBoundaryWrapperProps,
} from './ui-error-boundary'
import { isForbiddenError } from './forbidden'

type ForbiddenBoundaryProps = Pick<
  UIErrorBoundaryWrapperProps,
  'uiComponent' | 'uiComponentStyles' | 'children'
>

export function ForbiddenBoundary(props: ForbiddenBoundaryProps) {
  return (
    <UIErrorBoundaryWrapper
      nextError={'forbidden'}
      matcher={isForbiddenError}
      {...props}
    />
  )
}
