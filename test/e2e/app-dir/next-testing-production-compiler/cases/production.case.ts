import { expect, test } from 'vitest'
import { condition } from 'production-test-conditions'
import { value } from '../lib/value'

test('uses production conditions, optimized code and compiled setup', () => {
  expect(process.env.NODE_ENV).toBe('production')
  expect(condition).toBe('production')
  expect(value).toBe(42)
  expect((globalThis as any).__a3Setup).toBe('compiled setup')
})
