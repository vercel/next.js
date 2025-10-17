import { InvariantError } from '../../shared/lib/invariant-error'

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
      let pendingResult: R | Promise<R>
      setTimeout(() => {
        try {
          pendingResult = render()
        } catch (err) {
          reject(err)
        }
      }, 0)
      setTimeout(() => {
        followup()
        resolve(pendingResult)
      }, 0)
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
  three: (b: B) => C | Promise<C>
): Promise<C> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`pipelineInSequentialTasks` should not be called in edge runtime.'
    )
  } else {
    return new Promise((resolve, reject) => {
      let oneResult: A | undefined = undefined
      setTimeout(() => {
        try {
          oneResult = one()
        } catch (err) {
          clearTimeout(twoId)
          clearTimeout(threeId)
          reject(err)
        }
      }, 0)

      let twoResult: B | undefined = undefined
      const twoId = setTimeout(() => {
        // if `one` threw, then this timeout would've been cleared,
        // so if we got here, we're guaranteed to have a value.
        try {
          twoResult = two(oneResult!)
        } catch (err) {
          clearTimeout(threeId)
          reject(err)
        }
      }, 0)

      const threeId = setTimeout(() => {
        // if `two` threw, then this timeout would've been cleared,
        // so if we got here, we're guaranteed to have a value.
        try {
          resolve(three(twoResult!))
        } catch (err) {
          reject(err)
        }
      }, 0)
    })
  }
}
