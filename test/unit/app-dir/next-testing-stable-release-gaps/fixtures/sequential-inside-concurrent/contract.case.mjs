import { test, expect, describe } from 'vitest'
let phase = 0
describe.concurrent('parent', () => {
  describe('ordered children', { concurrent: false }, () => {
    test('first', () => expect(++phase).toBe(1))
    test('second', () => expect(++phase).toBe(2))
  })
})
