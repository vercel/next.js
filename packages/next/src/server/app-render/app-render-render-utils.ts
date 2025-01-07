import { InvariantError } from '../../shared/lib/invariant-error'

/**
 * This is a utility function to make scheduling sequential tasks that run back to back easier.
 * We schedule on the same queue (setImmediate) at the same time to ensure no other events can sneak in between.
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
      let pendingResult: R | Promise<R>
      setImmediate(() => {
        try {
          pendingResult = render()
        } catch (err) {
          reject(err)
        }
      })
      setImmediate(() => {
        followup()
        resolve(pendingResult)
      })
    })
  }
}
