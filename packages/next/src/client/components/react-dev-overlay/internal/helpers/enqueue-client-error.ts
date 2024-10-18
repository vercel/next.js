import { isHydrationError } from '../../../is-hydration-error'

// Dedupe the two consecutive errors: If the previous one is same as current one, ignore the current one.
export function enqueueConsecutiveDedupedError(
  queue: Array<Error>,
  error: Error
) {
  const isFront = isHydrationError(error)
  const previousError = isFront ? queue[0] : queue[queue.length - 1]
  // Only check message to see if it's the same error, as message is representative display in the console.
  if (previousError && previousError.message === error.message) {
    return
  }
  // TODO: change all to push error into errorQueue,
  // currently there's a async api error is always erroring while hydration error showing up.
  // Move hydration error to the front of the queue to unblock.
  if (isFront) {
    queue.unshift(error)
  } else {
    queue.push(error)
  }
}
