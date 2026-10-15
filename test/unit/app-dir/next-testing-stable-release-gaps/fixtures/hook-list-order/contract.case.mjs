import { test, expect, beforeEach, afterEach, afterAll } from 'vitest'
const trace = []
beforeEach(() => trace.push('before1'))
beforeEach(() => trace.push('before2'))
afterEach(() => trace.push('after1'))
afterEach(() => trace.push('after2'))
test('body', () => trace.push('body'))
afterAll(() =>
  expect(trace).toEqual(['before1', 'before2', 'body', 'after1', 'after2'])
)
