import { test, expect, vi } from 'vitest'
import { value, dependencyReady } from './b.mjs'
vi.mock('./b.mjs', async (original) => {
  const actual = await original()
  if (!actual.dependencyReady.done)
    throw new Error('fresh cyclic member own await was skipped')
  return { ...actual, value: 42 }
})
test('a directly loaded original waits for fresh cyclic member own awaits', () => {
  expect(value).toBe(42)
  expect(dependencyReady.done).toBe(true)
})
