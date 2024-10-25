const REACT_ERROR_STACK_BOTTOM_FRAME = 'react-stack-bottom-frame'

// Create a regex that matches the pivot frame in the stack trace
// chrome: at react-stack-bottom-frame
// safari: react-stack-bottom-frame@...
const createLocationRegex = (pivot: string) =>
  new RegExp(`(at ${pivot} )|(${pivot}\\@)`)

export function stripReactStackTrace(stack: string): string {
  const framePivotRegex = createLocationRegex(REACT_ERROR_STACK_BOTTOM_FRAME)
  const stackLines = stack.split('\n')
  const indexOfSplit = stackLines.findIndex((line) =>
    framePivotRegex.test(line)
  )
  const isOriginalReactError = indexOfSplit >= 0 // has the frame pivot
  const strippedStack = isOriginalReactError
    ? stackLines.slice(indexOfSplit + 1).join('\n')
    : stack

  return strippedStack
}
