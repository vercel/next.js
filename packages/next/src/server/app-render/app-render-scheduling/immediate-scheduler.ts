import { InvariantError } from '../../../shared/lib/invariant-error'
import { unpatchedSetImmediate } from '../../node-environment-extensions/fast-set-immediate.external'
import { runAsIOForReactIOTracking } from './react-io-tracking'
import type { SequentialTaskScheduler } from './types'

let hasBadSetImmediate = false

function warnAboutSetImmediate() {
  console.warn(
    "Next.js cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of `setImmediate()`.\nPlease report a github issue here: https://github.com/vercel/next.js/issues/new/"
  )
}

const enum ExecutionState {
  Before = 1,
  ScheduledTasks = 2,
  ExecutingTasks = 3,
  Finished = 4,
}

type Execution = {
  state: ExecutionState
  pendingTimeout: NodeJS.Timeout | null
}

/**
 * Allows scheduling multiple tasks that are guaranteed to run in the same iteration of the event loop.
 * Conceptually equivalent to calling `setImmediate(cb)` for each callback.
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

    const execution: Execution = {
      pendingTimeout: null,
      state: ExecutionState.Before,
    }

    const remainingImmediates: (NodeJS.Immediate | null)[] = []

    const onEnd = () => {
      execution.state = ExecutionState.Finished
      tasks.length = 0
      remainingImmediates.length = 0

      if (execution.pendingTimeout !== null) {
        clearTimeout(execution.pendingTimeout)
        execution.pendingTimeout = null
      }

      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort)
      }
    }

    let onAbort: (() => void) | undefined
    if (signal) {
      onAbort = () => {
        for (let i = 0; i < remainingImmediates.length; i++) {
          const timer = remainingImmediates[i]
          if (timer !== null) {
            clearImmediate(timer)
          }
        }
        onEnd()
      }
      signal.addEventListener('abort', onAbort, ONCE)
    }

    const runCallback = (callback: () => void, taskIndex: number) => {
      if (taskIndex === 0) {
        // When the first task runs, we should be in the ScheduledTasks state.
        // If we're not, something's very wrong with the scheduling.
        if (
          !hasBadSetImmediate &&
          execution.state !== ExecutionState.ScheduledTasks
        ) {
          hasBadSetImmediate = true
          warnAboutSetImmediate()
        }

        execution.state = ExecutionState.ExecutingTasks
      }

      remainingImmediates[taskIndex] = null

      try {
        if (process.env.NODE_ENV === 'development') {
          return runAsIOForReactIOTracking(callback)
        } else {
          return callback()
        }
      } finally {
        if (taskIndex === tasks.length - 1) {
          onEnd()
        }
      }
    }

    try {
      for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
        const task = tasks[taskIndex]

        const immediate = unpatchedSetImmediate(runCallback, task, taskIndex)
        remainingImmediates.push(immediate)

        // If we have more than one task, schedule a sentinel timeout between
        // scheduling the first and second tasks.
        if (!hasBadSetImmediate && taskIndex === 0 && tasks.length > 1) {
          execution.pendingTimeout = setTimeout(
            validateInterleavingInTimeout,
            0,
            execution
          )
        }
      }
      execution.state = ExecutionState.ScheduledTasks
    } catch (err) {
      onEnd()
      throw err
    }
  }
}

function validateInterleavingInTimeout(execution: Execution) {
  execution.pendingTimeout = null
  if (hasBadSetImmediate) {
    return
  }

  switch (execution.state) {
    case ExecutionState.Before: {
      // The timeout should never run before tasks are scheduled (synchronously).
      hasBadSetImmediate = true
      break
    }
    case ExecutionState.ScheduledTasks: {
      // In theory, it's okay to run timers before immediates, as long
      // as they consistently run separately.
      break
    }
    case ExecutionState.ExecutingTasks: {
      // The timeout should never run while tasks are running. This means that timeouts
      // interleaved with immediates, which can happen if a runtime polyfills `setImmediate`
      // as `setTimeout(_, 0)`.
      hasBadSetImmediate = true
      break
    }
    case ExecutionState.Finished: {
      // We should've cleared this timeout once we reached the
      // finished state, so this should be unreachable.
      break
    }
  }
  if (hasBadSetImmediate) {
    warnAboutSetImmediate()
  }
}

const ONCE = { once: true }
