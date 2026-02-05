import React from 'react'
import isError from '../../../../lib/is-error'

const ownerStacks = new WeakMap<Error, string | null>()

export function getOwnerStack(error: Error): string | null | undefined {
  return ownerStacks.get(error)
}
export function setOwnerStack(error: Error, stack: string | null) {
  ownerStacks.set(error, stack)
}

export function coerceError(value: unknown): Error {
  return isError(value) ? value : new Error('' + value)
}

export function setOwnerStackIfAvailable(error: Error): void {
  setOwnerStack(error, React.captureOwnerStack())
}

export function decorateDevError(thrownValue: unknown) {
  const error = coerceError(thrownValue)
  setOwnerStackIfAvailable(error)
  return error
}
