import React from 'react'

const captureOwnerStack = process.env.__NEXT_REACT_OWNER_STACK
  ? (React as any).captureOwnerStack
  : () => ''

const REACT_ERROR_STACK_BOTTOM_FRAME = 'react-stack-bottom-frame'
const REACT_ERROR_STACK_BOTTOM_FRAME_REGEX = new RegExp(
  `(at ${REACT_ERROR_STACK_BOTTOM_FRAME} )|(${REACT_ERROR_STACK_BOTTOM_FRAME}\\@)`
)

export function getReactStitchedError<T = unknown>(err: T): Error {
  const isErrorInstance = err instanceof Error
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
  const ownerStack = captureOwnerStack()
  if (ownerStack && newStack.endsWith(ownerStack) === false) {
    newStack += ownerStack
    // Override stack
    newError.stack = newStack
  }

  return newError
}
