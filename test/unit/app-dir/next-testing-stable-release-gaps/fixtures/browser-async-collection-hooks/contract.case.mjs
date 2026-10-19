import { describe, test, expect, beforeAll, afterAll } from 'vitest'
const trace = []
describe('async collection', async () => {
  await new Promise((resolve) => queueMicrotask(resolve))
  expect(typeof document).toBe('object')
  beforeAll(async () => {
    await Promise.resolve()
    trace.push('setup')
  })
  afterAll(async () => {
    await Promise.resolve()
    trace.push('teardown')
    expect(trace).toEqual(['setup', 'body', 'teardown'])
  })
  test('declaration retains its collection owner', async () => {
    await Promise.resolve()
    expect(trace).toEqual(['setup'])
    trace.push('body')
  })
})
