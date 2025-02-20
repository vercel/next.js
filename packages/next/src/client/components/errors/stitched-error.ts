import React from 'react'
import isError from '../../../lib/is-error'
import { copyNextErrorCode } from '../../../lib/error-telemetry-utils'

const REACT_ERROR_STACK_BOTTOM_FRAME = 'react-stack-bottom-frame'
const REACT_ERROR_STACK_BOTTOM_FRAME_REGEX = new RegExp(
  `(at ${REACT_ERROR_STACK_BOTTOM_FRAME} )|(${REACT_ERROR_STACK_BOTTOM_FRAME}\\@)`
)

export function getReactStitchedError<T = unknown>(err: T): Error | T {
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
  copyNextErrorCode(err, newError)
  newError.stack = newStack

  // Avoid duplicate overriding stack frames
  appendOwnerStack(newError)

  return newError
}

function appendOwnerStack(error: Error) {
  if (!React.captureOwnerStack) {
    return
  }
  let stack = error.stack || ''
  // This module is only bundled in development mode so this is safe.
  const ownerStack = React.captureOwnerStack()
  // Avoid duplicate overriding stack frames
  if (ownerStack && stack.endsWith(ownerStack) === false) {
    stack += ownerStack
    // Override stack
    error.stack = stack
  }
}
