// Dedupe the two consecutive errors: If the previous one is same as current one, ignore the current one.
export function enqueueConsecutiveDedupedError(
  queue: Array<Error>,
  error: Error
) {
  const previousError = queue[queue.length - 1]
  // Compare the error stack to dedupe the consecutive errors
  if (previousError && previousError.stack === error.stack) {
    return
  }
  queue.push(error)
}
