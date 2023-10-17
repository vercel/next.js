import type { ThenableRecord } from './router-reducer-types'

/**
 * Create data fetching record for Promise.
 */

export function createRecordFromThenable<T>(
  promise: PromiseLike<T>
): ThenableRecord<T> {
  const thenable = promise as any
  thenable.status = 'pending'
  thenable.then(
    (value: any) => {
      if (thenable.status === 'pending') {
        thenable.status = 'fulfilled'
        thenable.value = value
      }
    },
    (err: any) => {
      if (thenable.status === 'pending') {
        thenable.status = 'rejected'
        thenable.reason = err
      }
    }
  )
  return thenable
}
