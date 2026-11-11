import { test, expect, inject } from 'vitest'
test('async config factory and local helper', () => {
  expect(inject('value')).toBe(42)
  expect(inject('mode')).toBe('test')
  expect(inject('command')).toBe('serve')
})
