import { test, expect, beforeEach, afterEach } from 'vitest'
const trace = []
beforeEach(async () => {
  trace.push('a:start')
  await Promise.resolve()
  trace.push('a:end')
})
beforeEach(async () => {
  trace.push('b:start')
  await Promise.resolve()
  trace.push('b:end')
})
afterEach(() => console.log('RELEASE_TRACE=' + JSON.stringify(trace)))
test('parallel hooks start before either resolves', () => {
  expect(trace.slice(0, 2)).toEqual(['a:start', 'b:start'])
  expect(trace.slice(2)).toEqual(['a:end', 'b:end'])
})
