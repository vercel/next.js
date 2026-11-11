import { test, expect, inject } from 'vitest'
test('second isolated project', () => {
  expect(inject('project')).toBe('second')
  expect(globalThis.releaseProject).toBe('second')
})
