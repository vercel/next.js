import { test, expect, aroundEach, afterAll } from 'vitest'
const trace = []
aroundEach(async (run) => {
  trace.push('outer+')
  await run()
  trace.push('outer-')
})
aroundEach(async (run) => {
  trace.push('inner+')
  await run()
  trace.push('inner-')
})
test('body', () => trace.push('body'))
afterAll(() =>
  expect(trace).toEqual(['outer+', 'inner+', 'body', 'inner-', 'outer-'])
)
