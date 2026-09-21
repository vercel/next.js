/* global AggregateError */
function logError() {
  const error1 = Object.assign(new Error('Error 1'), { code: 'ERR_ONE' })
  const error2 = Object.assign(new TypeError('Error 2'), { code: 'ERR_TWO' })
  const aggregateError = new AggregateError([error1, error2], 'Aggregate')
  console.error(
    new Error('rsc-error-log-aggregate-nested', { cause: aggregateError })
  )
}

export default function Page() {
  logError()
  return null
}
