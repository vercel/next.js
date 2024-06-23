'use client'

import React from 'react'

import {
  UIErrorBoundaryWrapper,
  type UIErrorBoundaryWrapperProps,
} from './ui-error-boundary'
import { isForbiddenError } from './forbidden'
import { isNotFoundError } from './not-found'

type BoundaryConsumerProps = Pick<
  UIErrorBoundaryWrapperProps,
  'uiComponent' | 'uiComponentStyles' | 'children'
>

export function ForbiddenBoundary(props: BoundaryConsumerProps) {
  return (
    <UIErrorBoundaryWrapper
      nextError={'forbidden'}
      matcher={isForbiddenError}
      {...props}
    />
  )
}

export function NotFoundBoundary(props: BoundaryConsumerProps) {
  return (
    <UIErrorBoundaryWrapper
      nextError={'not-found'}
      matcher={isNotFoundError}
      {...props}
    />
  )
}
