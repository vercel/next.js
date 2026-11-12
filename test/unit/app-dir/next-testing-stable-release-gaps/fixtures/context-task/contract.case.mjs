import { test, expect } from 'vitest'
test('task exposes collection metadata', ({ task }) => {
  expect(task.name).toBe('task exposes collection metadata')
  expect(task.type).toBe('test')
  expect(task.file.filepath).toContain('contract.case.mjs')
  expect(task.suite).toBeUndefined()
  expect(task.id).toEqual(expect.any(String))
})
