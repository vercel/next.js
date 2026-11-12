import { test, expect } from 'vitest'
import { choose } from './subject.mjs'
let attempt = 0
test('retry retains both branches', { retry: 1 }, () => {
  if (++attempt === 1) {
    choose(true)
    throw new Error('retry')
  }
  expect(choose(false)).toBe('no')
})
