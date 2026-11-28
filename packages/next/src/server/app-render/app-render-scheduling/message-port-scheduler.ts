import { InvariantError } from '../../../shared/lib/invariant-error'
import { unpatchedSetImmediate } from '../../node-environment-extensions/fast-set-immediate.external'
import type { SequentialTaskScheduler } from './types'

let didWarnAboutRuntime = false

function warnAboutRuntime() {
  console.warn(
    "Next.js cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of `MessageChannel`.\nPlease report a github issue here: https://github.com/vercel/next.js/issues/new/"
  )
}

/**
 * Allows scheduling multiple tasks that are guaranteed to run in the same iteration of the event loop.
 *
 * Uses `MessagePort.postMessage` and expects that:
 * - each message to run in a separate task
 * - messages queued before attaching a listener will run uninterrupted.
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

    // As a sanity check, we schedule an immediate from the first tasks
    // to check if the execution was interrupted (i.e. if it ran between the taskss).
    // Note that we're deliberately bypassing the "fast setImmediate" patch here --
    // otherwise, this check would always fail, because the immediate
    // would always run before the second tasks.
    let didImmediateRun = false
    let pendingImmediate: NodeJS.Immediate | null = null

    // NOTE: In Node, MessagePorts are Async Resources which carry an async context,
    // and the message listener runs in the ALS context that the port was created in,
    // so the callbacks we run in the listener will have access to the same ALS context
    // that we're in right now.
    const { port1: receivePort, port2: sendPort } = new MessageChannel()

    // Queue a message for each tasks that's been schedule.
    // Each message will be processed in a separate task.
    for (let i = 0; i < tasks.length; i++) {
      sendPort.postMessage(null)
    }

    let currentTaskIndex = 0
    const runNextTaskOnMessage = () => {
      if (signal?.aborted) {
        return
      }

      const taskIndex = currentTaskIndex++

      const task = tasks[taskIndex]

      try {
        if (!didWarnAboutRuntime) {
          if (taskIndex === 0) {
            // The first task schedules a sentinel immediate.
            pendingImmediate = unpatchedSetImmediate(() => {
              didImmediateRun = true
              pendingImmediate = null
            })
          } else {
            if (didImmediateRun) {
              didWarnAboutRuntime = true
              // If the first task's immediate managed to run between the tasks, then we're not
              // able to provide the guarantees that we're supposed to.
              warnAboutRuntime()
            }
          }
        }

        task()
      } catch (err) {
        // Thrown errors will interrupt the message processing loop.
        // Rethrow then in a microtask instead
        queueMicrotask(() => {
          throw err
        })
      }

      // If this is the last message, we're done.
      if (taskIndex === tasks.length - 1) {
        onEnd()
      }
    }

    receivePort.addEventListener('message', runNextTaskOnMessage)

    const onEnd = () => {
      tasks.length = 0

      receivePort.removeEventListener('message', runNextTaskOnMessage)
      sendPort.close()
      receivePort.close()

      if (pendingImmediate !== null) {
        clearImmediate(pendingImmediate)
      }

      if (signal) {
        signal.removeEventListener('abort', onEnd)
      }
    }

    signal?.addEventListener('abort', onEnd, ONCE)
  }
}

const ONCE = { once: true }
