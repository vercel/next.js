/**
 * Create data fetching record for Promise.
 */
// TODO-APP: change `any` to type inference.
export function createRecordFromThenable(thenable: any) {
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
        thenable.value = err
      }
    }
  )
  return thenable
}
