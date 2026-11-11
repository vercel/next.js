import { test, expect, inject } from 'vitest'
test('global setup provides value before evaluation', () =>
  expect(inject('setupValue')).toBe(42))
