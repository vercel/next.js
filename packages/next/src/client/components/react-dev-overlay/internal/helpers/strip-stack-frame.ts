export function stripStackByFrame(
  stack: string,
  framePivot: string,
  stripAfter: boolean
): string {
  const framePivotRegex = new RegExp(`(at ${framePivot} )|(${framePivot}\\@)`)
  const stackLines = stack.split('\n')
  const indexOfSplit = stackLines.findIndex((line) =>
    framePivotRegex.test(line)
  )
  const isOriginalReactError = indexOfSplit >= 0 // has the frame pivot
  const strippedStack = isOriginalReactError
    ? stripAfter
      ? // Keep the frames before pivot
        stackLines.slice(0, indexOfSplit).join('\n')
      : // Keep the frames after pivot
        stackLines.slice(indexOfSplit + 1).join('\n')
    : stack

  return strippedStack
}
