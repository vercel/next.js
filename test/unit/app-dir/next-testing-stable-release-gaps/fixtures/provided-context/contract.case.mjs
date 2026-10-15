import { test, expect, inject } from 'vitest'
test('provided context crosses into worker', () =>
  expect(inject('releaseValue')).toBe(42))
