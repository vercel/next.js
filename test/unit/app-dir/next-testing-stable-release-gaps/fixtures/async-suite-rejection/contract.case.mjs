import { test, describe, expect } from 'vitest'
describe('rejected asynchronous collector', async () => {
  test('declared before rejection', () => expect(42).toBe(42))
  await Promise.resolve()
  throw new Error('release async collection error')
})
test('sibling remains represented', () => expect(42).toBe(42))
