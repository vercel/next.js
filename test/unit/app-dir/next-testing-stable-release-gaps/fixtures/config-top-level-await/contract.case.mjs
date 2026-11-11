import { test, expect, inject } from 'vitest'
test('top level await and promised config', () =>
  expect(inject('value')).toBe(42))
