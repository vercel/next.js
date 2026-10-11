import { afterAll, expect, it } from 'vitest'

it('passes before disposal', () => {
  expect(1).toBe(1)
})
afterAll(() => {
  setImmediate(() => {
    try {
      expect(1).toBe(1)
    } catch {}
  })
})
