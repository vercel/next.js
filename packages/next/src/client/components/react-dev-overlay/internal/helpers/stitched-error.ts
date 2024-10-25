import React from 'react'
import isError from '../../../../../lib/is-error'
import { stripReactStackTrace } from './strip-stack-frame'

export function getReactStitchedError<T = unknown>(err: T): Error | T {
  if (typeof (React as any).captureOwnerStack !== 'function') {
    return err
  }

  const isErrorInstance = isError(err)
  const originStack = isErrorInstance ? err.stack || '' : ''
  const originMessage = isErrorInstance ? err.message : ''
  let newStack = stripReactStackTrace(originStack)

  const newError = new Error(originMessage)
  // Copy all enumerable properties, e.g. digest
  Object.assign(newError, err)
  newError.stack = newStack

  // Avoid duplicate overriding stack frames
  const ownerStack = (React as any).captureOwnerStack()
  if (ownerStack && newStack.endsWith(ownerStack) === false) {
    newStack += ownerStack
    // Override stack
    newError.stack = newStack
  }

  return newError
}
