import { InvariantError } from '../../../shared/lib/invariant-error'
import {
  DANGEROUSLY_runPendingImmediatesAfterCurrentTask,
  expectNoPendingImmediates,
  scheduleAfterFastImmediates,
  unpatchedSetImmediate,
} from '../../node-environment-extensions/fast-set-immediate.external'
import type { SequentialTaskScheduler } from './types'

// let shouldAttemptPatching = true

// function warnAboutTimers() {
//   console.warn(
//     "Next.js cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of `setImmediate()` and `process.nextTick()`.\nPlease report a github issue here: https://github.com/vercel/next.js/issues/new/"
//   )
// }

/**
 * Allows scheduling multiple tasks that are guaranteed to run in the same iteration of the event loop.
 *
 * This implementation does not actually use real tasks. Instead, it simulates task-like behavior
 * using `process.nextTick`, same as what we do in the `fast-set-immediate` implementation.
 *
 * @param tasks - the callbacks to run. NOTE: the array is cleared after tasks are executed or aborted.
 * */
export const scheduleSequentialTasks: SequentialTaskScheduler = (
  tasks,
  signal
) => {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'scheduleSequentialTasks cannot be called in the edge runtime'
    )
  } else {
    if (tasks.length === 0) return
    if (signal?.aborted) return

    const remainingCancels: ((() => void) | null)[] = []

    const onEnd = () => {
      tasks.length = 0
      remainingCancels.length = 0

      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort)
      }
    }

    let onAbort: (() => void) | undefined
    if (signal) {
      onAbort = () => {
        for (let i = 0; i < remainingCancels.length; i++) {
          const cancel = remainingCancels[i]
          if (cancel !== null) {
            cancel()
          }
        }
        onEnd()
      }
      signal?.addEventListener('abort', onAbort, ONCE)
    }

    const runCallback = (callback: () => void, taskIndex: number) => {
      remainingCancels[taskIndex] = null
      if (taskIndex === tasks.length - 1) {
        try {
          return callback()
        } finally {
          onEnd()
        }
      }
      return callback()
    }

    unpatchedSetImmediate(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
        const task = tasks[taskIndex]

        const cancel = scheduleAfterFastImmediates(
          runCallback.bind(null, task, taskIndex)
        )
        remainingCancels.push(cancel)
      }
    })
    unpatchedSetImmediate(expectNoPendingImmediates)
  }
}

const ONCE = { once: true }
