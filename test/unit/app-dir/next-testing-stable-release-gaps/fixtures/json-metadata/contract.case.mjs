import { test, expect, describe } from 'vitest'
describe('outer', () => {
  test('passed', () => expect(42).toBe(42))
  test.skip('skipped', () => {})
  test.todo('todo')
})
