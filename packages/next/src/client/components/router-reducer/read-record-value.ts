/**
 * Read record value or throw Promise if it's not resolved yet.
 */
export function readRecordValue<T>(thenable: Promise<T>): T {
  // @ts-expect-error TODO: fix type
  if (thenable.status === 'fulfilled') {
    // @ts-expect-error TODO: fix type
    return thenable.value
  } else {
    throw thenable
  }
}
