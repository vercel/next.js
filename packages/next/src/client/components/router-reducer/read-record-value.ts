import type { ThenableRecord } from './router-reducer-types'

/**
 * Read record value or throw Promise if it's not resolved yet.
 */
export function readRecordValue<T>(thenable: ThenableRecord<T>): T {
  if (thenable.status === 'fulfilled') {
    return thenable.value
  } else {
    throw thenable
  }
}
