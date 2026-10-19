import { test, expect, vi } from 'vitest'
import { read } from './a.mjs'
vi.mock('./b.mjs', () => ({ value: 42 }))
test('full cyclic mock leaves the original unevaluated', () => {
  expect(read()).toBe(42)
})
