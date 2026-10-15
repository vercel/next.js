import { test, expect } from 'vitest'
test('first fails', () => expect(1).toBe(2))
test('second is not executed after bail', () => {
  throw new Error('bail lost')
})
