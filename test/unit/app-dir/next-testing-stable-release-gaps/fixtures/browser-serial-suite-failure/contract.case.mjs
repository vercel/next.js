import { test, describe, expect, beforeAll, afterAll } from 'vitest'
const trace = []
describe('failed setup', () => {
  beforeAll(async () => {
    await Promise.resolve()
    trace.push('setup')
    throw new Error('browser serial suite setup failure')
  })
  test('blocked one', () => {
    throw new Error('first blocked body must not execute')
  })
  describe('nested blocked suite', () => {
    test('blocked two', () => {
      throw new Error('second blocked body must not execute')
    })
  })
})
test('unblocked sibling', async () => {
  await Promise.resolve()
  expect(trace).toEqual(['setup'])
  trace.push('sibling')
})
afterAll(async () => {
  await Promise.resolve()
  expect(trace).toEqual(['setup', 'sibling'])
})
