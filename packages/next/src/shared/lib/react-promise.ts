import type { FulfilledReactPromise } from 'react'

/**
 * Creates a fulfilled thenable that React can unwrap synchronously via `use()`
 * without ever suspending.
 * */
export function createResolvedReactPromise<T>(
  value: T
): Promise<T> & FulfilledReactPromise<T> {
  const promise: Promise<T> = Promise.resolve(value)

  const fulfilledPromise = promise as unknown as Promise<T> &
    FulfilledReactPromise<T>

  fulfilledPromise.status = 'fulfilled'
  fulfilledPromise.value = value

  return fulfilledPromise
}
