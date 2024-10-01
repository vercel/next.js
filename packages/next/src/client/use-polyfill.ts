import * as React from 'react'

const reactUse: typeof React.use | undefined =
  // @ts-expect-error
  // eslint-disable-next-line no-useless-concat
  React['u' + 'se']

type PendingThenable<T> = Promise<T> & {
  status: 'pending'
}

type FulfilledThenable<T> = Promise<T> & {
  status: 'fulfilled'
  value: T
}

type RejectedThenable<T> = Promise<T> & {
  status: 'rejected'
  reason: unknown
}

type Thenable<T> =
  | PendingThenable<T>
  | FulfilledThenable<T>
  | RejectedThenable<T>

export function polyfill_use<T>(promise: Promise<T>): T {
  if (typeof reactUse === 'function') {
    return reactUse(promise)
  }
  return polyfillUseImpl(promise)
}

function polyfillUseImpl<T>(promise: Promise<T>): T {
  const thenable = trackThenableState(promise)
  if (thenable.status === 'pending') {
    // legacy suspense
    throw thenable
  } else if (thenable.status === 'rejected') {
    throw thenable.reason
  } else if (thenable.status === 'fulfilled') {
    return thenable.value
  } else {
    const _thenable = thenable as Promise<T> & { status: unknown }
    throw new Error(
      `Invalid promise status in polyfill_use: ${_thenable.status}`
    )
  }
}

function trackThenableState<T>(promise: Promise<T>): Thenable<T> {
  {
    const promiseOrThenable = promise as Promise<T> | Thenable<T>
    if (
      'status' in promiseOrThenable &&
      typeof promiseOrThenable.status === 'string'
    ) {
      return promiseOrThenable
    }
  }
  const pending = promise as PendingThenable<T>
  pending.status = 'pending'
  pending.then(
    (value) => {
      const fulfilled = promise as FulfilledThenable<T>
      fulfilled.status = 'fulfilled'
      fulfilled.value = value
    },
    (reason) => {
      const rejected = promise as RejectedThenable<T>
      rejected.status = 'rejected'
      rejected.reason = reason
    }
  )
  return pending
}
