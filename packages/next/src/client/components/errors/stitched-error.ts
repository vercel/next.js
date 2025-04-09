import React from 'react'
import isError from '../../../lib/is-error'

const ownerStacks = new WeakMap<Error, string | null>()
const componentStacks = new WeakMap<Error, string>()

export function getComponentStack(error: Error): string | undefined {
  return componentStacks.get(error)
}
export function setComponentStack(error: Error, stack: string) {
  componentStacks.set(error, stack)
}

export function getOwnerStack(error: Error): string | null | undefined {
  return ownerStacks.get(error)
}
export function setOwnerStack(error: Error, stack: string | null) {
  ownerStacks.set(error, stack)
}

export function getReactStitchedError(err: unknown): Error {
  const newError = isError(err)
    ? err
    : // TODO: stringify thrown value
      new Error('Thrown value was ignored. This is a bug in Next.js.')

  // React 18 and prod does not have `captureOwnerStack`
  if ('captureOwnerStack' in React) {
    // TODO: Hoist these to callsites to ensure we set the correct Owner Stack.
    setOwnerStack(newError, React.captureOwnerStack())
  }

  return newError
}
