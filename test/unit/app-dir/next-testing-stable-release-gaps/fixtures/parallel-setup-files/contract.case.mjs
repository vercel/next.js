import { test, expect } from 'vitest'
import { trace } from './barrier.mjs'
test('parallel setup imports both reach the shared barrier', () => {
  expect(new Set(trace.slice(0, 2))).toEqual(new Set(['a:start', 'b:start']))
  expect(new Set(trace.slice(2))).toEqual(new Set(['a:end', 'b:end']))
})
