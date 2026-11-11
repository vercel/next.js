import { test, expect } from 'vitest'
let tries = 0
test('earlier repeat fails', { repeats: 1 }, () => {
  expect(++tries).toBe(2)
})
