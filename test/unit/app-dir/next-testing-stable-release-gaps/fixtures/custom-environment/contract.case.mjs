import { test, expect } from 'vitest'
test('custom realm setup is visible', () =>
  expect(globalThis.releaseRealm).toBe(42))
