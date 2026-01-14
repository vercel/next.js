import { InvariantError } from '../../shared/lib/invariant-error'
import { createAtomicTaskGroup } from './app-render-scheduling'
import {
  DANGEROUSLY_runPendingImmediatesAfterCurrentTask,
  expectNoPendingImmediates,
} from '../node-environment-extensions/fast-set-immediate.external'
import { cancelTask } from './sequential-tasks.external'

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
      const scheduleTask = createAtomicTaskGroup()

      let pendingResult: R | Promise<R>
      scheduleTask(() => {
        try {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
          pendingResult = render()
        } catch (err) {
          reject(err)
        }
      })

      scheduleTask(() => {
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
      const scheduleTask = createAtomicTaskGroup()

      let oneResult: A
      scheduleTask(() => {
        try {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
          oneResult = one()
        } catch (err) {
          cancelTask(twoId)
          cancelTask(threeId)
          cancelTask(fourId)
          reject(err)
        }
      })

      let twoResult: B
      const twoId = scheduleTask(() => {
        // if `one` threw, then this timeout would've been cleared,
        // so if we got here, we're guaranteed to have a value.
        try {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
          twoResult = two(oneResult!)
        } catch (err) {
          cancelTask(threeId)
          cancelTask(fourId)
          reject(err)
        }
      })

      let threeResult: C
      const threeId = scheduleTask(() => {
        // if `two` threw, then this timeout would've been cleared,
        // so if we got here, we're guaranteed to have a value.
        try {
          expectNoPendingImmediates()
          threeResult = three(twoResult!)
        } catch (err) {
          cancelTask(fourId)
          reject(err)
        }
      })

      // We wait a task before resolving/rejecting
      const fourId = scheduleTask(() => {
        resolve(threeResult)
      })
    })
  }
}
