import { test, expect, aroundAll, beforeAll, afterAll } from 'vitest'
const trace = []
aroundAll(async (run) => {
  trace.push('suite+')
  await run()
  trace.push('suite-')
  expect(trace).toEqual(['suite+', 'setup', 'body', 'teardown', 'suite-'])
})
beforeAll(() => trace.push('setup'))
afterAll(() => trace.push('teardown'))
test('body', () => trace.push('body'))
