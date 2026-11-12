import { test, expect } from 'vitest'
import * as subject from './subject.mjs'
import { value } from './subject.mjs'
test('config helper closure transforms the real Next module once', async () => {
  expect(value).toBe(3)
  expect(subject.value).toBe(3)
  expect(await import('./subject.mjs')).toBe(subject)
})
