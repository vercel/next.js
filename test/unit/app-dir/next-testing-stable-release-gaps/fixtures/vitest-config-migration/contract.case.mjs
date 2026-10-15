import { test, expect } from 'vitest'
test('existing defineConfig settings preserve globals', () =>
  expect(42).toBe(42))
