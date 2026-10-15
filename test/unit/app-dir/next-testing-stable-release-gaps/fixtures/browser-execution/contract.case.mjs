import { test, expect } from 'vitest'
test('test body executes in an actual client realm', () => {
  expect(typeof window).toBe('object')
  expect(typeof document).toBe('object')
  expect(typeof process).toBe('undefined')
  expect(navigator.userAgent).toContain('Mozilla')
})
