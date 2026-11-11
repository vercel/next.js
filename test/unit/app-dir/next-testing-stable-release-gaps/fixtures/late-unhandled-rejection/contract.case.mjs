import { test, expect } from 'vitest'
test('finished body retains unhandled error evidence', async () => {
  Promise.reject(new Error('release unhandled error'))
  await new Promise((resolve) => setImmediate(resolve))
  expect(42).toBe(42)
})
