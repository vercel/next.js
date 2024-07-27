'use client'

import {
  UIErrorBoundaryWrapper,
  type UIErrorBoundaryWrapperProps,
} from './ui-error-boundary'
import { isForbiddenError } from './forbidden'
import { isNotFoundError } from './not-found'

type BoundaryConsumerProps = Pick<
  UIErrorBoundaryWrapperProps,
  'forbidden' | 'not-found' | 'children'
>

const matcher = (err: unknown) => {
  if (isForbiddenError(err)) {
    return 'forbidden'
  }
  if (isNotFoundError(err)) {
    return 'not-found'
  }
}

export function UIErrorsBoundary(props: BoundaryConsumerProps) {
  return <UIErrorBoundaryWrapper matcher={matcher} {...props} />
}
