import { InvariantError } from '../../shared/lib/invariant-error'
import { createAtomicTimerGroup } from './app-render-scheduling'

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
          pendingResult = render()
        } catch (err) {
          reject(err)
        }
      })

      scheduleTimeout(() => {
        followup()
        resolve(pendingResult)
      })
    })
  }
}

/**
 * This is a utility function to make scheduling sequential tasks that run back to back easier.
 * We schedule on the same queue (setTimeout) at the same time to ensure no other events can sneak in between.
 * The function that runs in the second task gets access to the first tasks's result.
 */
export function pipelineInSequentialTasks<A, B, C>(
  one: () => A,
  two: (a: A) => B,
  three: (b: B) => C
): Promise<C> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`pipelineInSequentialTasks` should not be called in edge runtime.'
    )
  } else {
    return new Promise((resolve, reject) => {
      const scheduleTimeout = createAtomicTimerGroup()

      let oneResult: A
      scheduleTimeout(() => {
        try {
          oneResult = one()
        } catch (err) {
          clearTimeout(twoId)
          clearTimeout(threeId)
          clearTimeout(fourId)
          reject(err)
        }
      })

      let twoResult: B
      const twoId = scheduleTimeout(() => {
        // if `one` threw, then this timeout would've been cleared,
        // so if we got here, we're guaranteed to have a value.
        try {
          twoResult = two(oneResult!)
        } catch (err) {
          clearTimeout(threeId)
          clearTimeout(fourId)
          reject(err)
        }
      })

      let threeResult: C
      const threeId = scheduleTimeout(() => {
        // if `two` threw, then this timeout would've been cleared,
        // so if we got here, we're guaranteed to have a value.
        try {
          threeResult = three(twoResult!)
        } catch (err) {
          clearTimeout(fourId)
          reject(err)
        }
      })

      // We wait a task before resolving/rejecting
      const fourId = scheduleTimeout(() => {
        resolve(threeResult)
      })
    })
  }
}
