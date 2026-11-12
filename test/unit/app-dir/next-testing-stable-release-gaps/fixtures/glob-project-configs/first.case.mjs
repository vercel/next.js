import { test, expect, inject } from 'vitest'
test('first isolated project', () => {
  expect(inject('project')).toBe('first')
  expect(globalThis.releaseProject).toBe('first')
})
