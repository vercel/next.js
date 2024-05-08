'use client'

import React from 'react'

import {
  UIErrorBoundaryWrapper,
  type UIErrorBoundaryWrapperProps,
} from './ui-error-boundary'
import { isForbiddenError } from './forbidden'
import { isNotFoundError } from './not-found'

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
