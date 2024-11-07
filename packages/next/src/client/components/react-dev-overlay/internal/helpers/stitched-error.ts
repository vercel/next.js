import React from 'react'
import isError from '../../../../../lib/is-error'

const REACT_ERROR_STACK_BOTTOM_FRAME = 'react-stack-bottom-frame'
const REACT_ERROR_STACK_BOTTOM_FRAME_REGEX = new RegExp(
  `(at ${REACT_ERROR_STACK_BOTTOM_FRAME} )|(${REACT_ERROR_STACK_BOTTOM_FRAME}\\@)`
)

const captureOwnerStack = (React as any).captureOwnerStack
  ? (React as any).captureOwnerStack
  : () => ''

export function getReactStitchedError<T = unknown>(err: T): Error | T {
  if (typeof (React as any).captureOwnerStack !== 'function') {
    return err
  }
  const isErrorInstance = isError(err)
  const originStack = isErrorInstance ? err.stack || '' : ''
  const originMessage = isErrorInstance ? err.message : ''
  const stackLines = originStack.split('\n')
  const indexOfSplit = stackLines.findIndex((line) =>
    REACT_ERROR_STACK_BOTTOM_FRAME_REGEX.test(line)
  )
  const isOriginalReactError = indexOfSplit >= 0 // has the react-stack-bottom-frame
  let newStack = isOriginalReactError
    ? stackLines.slice(0, indexOfSplit).join('\n')
    : originStack

  const newError = new Error(originMessage)
  // Copy all enumerable properties, e.g. digest
  Object.assign(newError, err)
  newError.stack = newStack

  // Avoid duplicate overriding stack frames
  appendOwnerStack(newError)

  return newError
}

function appendOwnerStack(error: Error) {
  let stack = error.stack || ''
  // Avoid duplicate overriding stack frames
  const ownerStack = captureOwnerStack()
  if (ownerStack && stack.endsWith(ownerStack) === false) {
    stack += ownerStack
    // Override stack
    error.stack = stack
  }
}
