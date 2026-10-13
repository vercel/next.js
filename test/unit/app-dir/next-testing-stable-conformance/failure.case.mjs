import { test, expect, afterAll } from 'vitest'
test('real assertion failure', () => expect({ value: 1 }).toEqual({ value: 2 }))
afterAll(() => {
  throw new Error('retained teardown failure')
})
