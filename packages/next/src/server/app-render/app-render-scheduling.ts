import { InvariantError } from '../../shared/lib/invariant-error'
import { unpatchedSetImmediate } from '../node-environment-extensions/fast-set-immediate.external'
import { scheduleTask } from './sequential-tasks'

function warnAboutRuntime() {
  console.warn(
    "Next.js cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of `MessageChannel`.\nPlease report a github issue here: https://github.com/vercel/next.js/issues/new/"
  )
}

/**
 * Allows scheduling multiple timers (equivalent to `setTimeout(cb, delayMs)`)
 * that are guaranteed to run in the same iteration of the event loop.
 *
 * @param delayMs - the delay to pass to `setTimeout`. (default: 0)
 *
 * */
export function createAtomicTaskGroup() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'createAtomicTaskGroup cannot be called in the edge runtime'
    )
  } else {
    let pendingTasks = 0

    // As a sanity check, we schedule an immediate from the first tasks
    // to check if the execution was interrupted (i.e. if it ran between the taskss).
    // Note that we're deliberately bypassing the "fast setImmediate" patch here --
    // otherwise, this check would always fail, because the immediate
    // would always run before the second tasks.
    let didImmediateRun = false
    let pendingImmediate: NodeJS.Immediate | null = null

    function runCallback(callback: () => void, isFirst: boolean) {
      if (isFirst) {
        pendingImmediate = unpatchedSetImmediate(() => {
          didImmediateRun = true
          pendingImmediate = null
        })
      } else {
        if (didImmediateRun) {
          // If the immediate managed to run between the tasks, then we're not
          // able to provide the guarantees that we're supposed to
          warnAboutRuntime()
        }
      }
      pendingTasks--
      return callback()
    }

    return function scheduleTaskInGroup(callback: () => void) {
      const isFirst = pendingTasks === 0
      if (isFirst) {
        didImmediateRun = false
        if (pendingImmediate) {
          clearImmediate(pendingImmediate)
          pendingImmediate = null
        }
      }
      const task = scheduleTask(runCallback.bind(null, callback, isFirst))
      pendingTasks++
      return task
    }
  }
}
