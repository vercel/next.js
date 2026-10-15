import { test, expect } from 'vitest'
import { url } from 'node:inspector'
test('debug selected original test', () =>
  expect(url()).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\//))
test('not selected', () => {
  throw new Error('wrong selection')
})
