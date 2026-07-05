/* global AggregateError */
function logError() {
  const error1 = new Error('Error 1')
  const error2 = new TypeError('Error 2')
  const rootError = new Error('Root error')
  const aggregateError = new AggregateError(
    [error1, error2],
    'rsc-error-log-aggregate',
    { cause: rootError }
  )
  console.error(aggregateError)
}

export default function Page() {
  logError()
  return null
}
