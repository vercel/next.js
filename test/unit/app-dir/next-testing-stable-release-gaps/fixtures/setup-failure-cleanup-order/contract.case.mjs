import { test, describe, beforeEach, afterEach, afterAll, expect } from 'vitest'
const trace = []
beforeEach(() => {
  trace.push('outer setup')
  return () => trace.push('outer returned cleanup')
})
afterEach(() => trace.push('outer teardown'))
describe('failed inner setup', () => {
  beforeEach(() => {
    trace.push('inner setup')
    throw new Error('release setup failure')
  })
  afterEach(() => trace.push('inner teardown'))
  test('body blocked by setup', () => trace.push('body'))
})
afterAll(() => {
  expect(trace).not.toContain('body')
  console.log('RELEASE_TRACE=' + JSON.stringify(trace))
})
