/* global aroundAll, aroundEach, assertType */
const trace = []
aroundAll(async (run) => {
  trace.push('all+')
  await run()
  trace.push('all-')
  expect(trace).toEqual(['all+', 'each+', 'body', 'each-', 'all-'])
})
aroundEach(async (run) => {
  trace.push('each+')
  await run()
  trace.push('each-')
})
test('global around hooks retain their suite and case owners', () => {
  assertType(42)
  trace.push('body')
  expect(42).toBe(42)
})
