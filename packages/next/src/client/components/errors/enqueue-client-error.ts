import { isHydrationError } from '../is-hydration-error'
import { isUnhandledConsoleOrRejection } from './console-error'
import { getStackBeforeReactBottomFrame } from './stitched-error'

// Dedupe the two consecutive errors: If the previous one is same as current one, ignore the current one.
export function enqueueConsecutiveDedupedError(
  queue: Array<Error>,
  error: Error
) {
  const isFront = isHydrationError(error)
  const previousError = isFront ? queue[0] : queue[queue.length - 1]
  // Compare the error stack to dedupe the consecutive errors
  if (previousError) {
    // React strict mode double invocation will result in the slightly different error stack.
    // After react-stack-bottom-frame, the error stack is different.
    // original one will has `renderWithHooks` in stack;
    // replied one will has `renderWithHooksAgain` in stack;
    // So we striped the stack after `react-stack-bottom-frame` then to compare the error stack.
    if (
      isUnhandledConsoleOrRejection(previousError) &&
      isUnhandledConsoleOrRejection(error) &&
      // Check if the error stack starts with the previous error stack
      getStackBeforeReactBottomFrame(error.stack || '') ===
        getStackBeforeReactBottomFrame(previousError.stack || '')
    ) {
      return
    } else if (previousError.stack === error.stack) {
      return
    }
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
