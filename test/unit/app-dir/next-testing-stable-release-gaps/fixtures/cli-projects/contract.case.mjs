import { test, expect, inject } from 'vitest'
test('selected project gets own provided value', () =>
  expect(inject('project')).toBe('second'))
