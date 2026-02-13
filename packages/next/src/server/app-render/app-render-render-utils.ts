import { InvariantError } from '../../shared/lib/invariant-error'
import { createAtomicTimerGroup } from './app-render-scheduling'
import {
  DANGEROUSLY_runPendingImmediatesAfterCurrentTask,
  expectNoPendingImmediates,
} from '../node-environment-extensions/fast-set-immediate.external'

function noop() {}

/**
 * This is a utility function to make scheduling sequential tasks that run back to back easier.
 * We schedule on the same queue (setTimeout) at the same time to ensure no other events can sneak in between.
 */
export function scheduleInSequentialTasks<R>(
  render: () => R | Promise<R>,
  followup: () => void
): Promise<R> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`scheduleInSequentialTasks` should not be called in edge runtime.'
    )
  } else {
    return new Promise((resolve, reject) => {
      const scheduleTimeout = createAtomicTimerGroup()

      let pendingResult: R | Promise<R>
      scheduleTimeout(() => {
        try {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
          pendingResult = render()
        } catch (err) {
          reject(err)
        }
      })

      scheduleTimeout(() => {
        try {
          expectNoPendingImmediates()
          followup()
          resolve(pendingResult)
        } catch (err) {
          reject(err)
        }
      })
    })
  }
}

/**
 * This is a utility function to make scheduling sequential tasks that run back to back easier.
 * We schedule on the same queue (setTimeout) at the same time to ensure no other events can sneak in between.
 *
 * The first function runs in the first task. Each subsequent function runs in its own task.
 * The returned promise resolves after the last task completes.
 */
export function runInSequentialTasks<R>(
  first: () => R,
  ...rest: Array<() => void>
): Promise<Awaited<R>> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`runInSequentialTasks` should not be called in edge runtime.'
    )
  } else {
    return new Promise((resolve, reject) => {
      const scheduleTimeout = createAtomicTimerGroup()
      const ids: ReturnType<typeof scheduleTimeout>[] = []

      let result: R
      ids.push(
        scheduleTimeout(() => {
          try {
            DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
            result = first()
            // If the first function returns a thenable, suppress unhandled
            // rejections. A later task in the sequence (e.g. an abort) may
            // cause the promise to reject, and we don't want that to surface
            // as an unhandled rejection — the caller will observe the
            // rejection when they await the returned promise.
            if (result !== null && typeof (result as any).then === 'function') {
              ;(result as any).then(noop, noop)
            }
          } catch (err) {
            for (let i = 1; i < ids.length; i++) {
              clearTimeout(ids[i])
            }
            reject(err)
          }
        })
      )

      for (let i = 0; i < rest.length; i++) {
        const fn = rest[i]
        let index = ids.length

        ids.push(
          scheduleTimeout(() => {
            try {
              DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
              fn()
            } catch (err) {
              // clear remaining timeouts
              while (++index < ids.length) {
                clearTimeout(ids[index])
              }
              reject(err)
            }
          })
        )
      }

      // We wait a task before resolving
      ids.push(
        scheduleTimeout(() => {
          try {
            expectNoPendingImmediates()
            resolve(result as Awaited<R>)
          } catch (err) {
            reject(err)
          }
        })
      )
    })
  }
}
