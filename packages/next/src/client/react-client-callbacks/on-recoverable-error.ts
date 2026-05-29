// This module can be shared between both pages router and app router

import type { HydrationOptions } from 'react-dom/client'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import isError from '../../lib/is-error'
import { reportGlobalError } from './report-global-error'

const recoverableErrors = new WeakSet<Error>()

const isInstantTest =
  process.env.__NEXT_EXPOSE_TESTING_API &&
  typeof self !== 'undefined' &&
  !!self.__next_instant_test

export function isRecoverableError(error: Error): boolean {
  return recoverableErrors.has(error)
}

export const onRecoverableError: HydrationOptions['onRecoverableError'] = (
  error
) => {
  // x-ref: https://github.com/facebook/react/pull/28736
  let cause = isError(error) && 'cause' in error ? error.cause : error
  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(cause)) return

  // Instant Navigation Testing API: suppress "server could not finish this
  // Suspense boundary" errors (React error #419) during instant test mode.
  // The static shell intentionally has incomplete Suspense boundaries — React
  // correctly falls back to client rendering, which is expected.
  if (isInstantTest) {
    if (isError(cause)) {
      if (process.env.NODE_ENV === 'production') {
        if (cause.message.includes('#419')) return
      } else {
        if (cause.message.includes('could not finish this Suspense boundary'))
          return
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const { decorateDevError } =
      require('../../next-devtools/userspace/app/errors/stitched-error') as typeof import('../../next-devtools/userspace/app/errors/stitched-error')
    const causeError = decorateDevError(cause)
    recoverableErrors.add(causeError)
    cause = causeError
  }

  reportGlobalError(cause)
}
