import { test, expect, afterAll } from 'vitest'
let completed = false
afterAll(async () => {
  await Promise.resolve()
  expect(completed).toBe(true)
  throw new Error('browser suite teardown failure')
})
test('body completes before failed suite teardown', async () => {
  await Promise.resolve()
  expect(typeof document).toBe('object')
  completed = true
})
