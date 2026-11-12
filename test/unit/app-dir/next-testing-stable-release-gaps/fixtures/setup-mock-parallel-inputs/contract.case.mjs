import { test, expect } from 'vitest'
import * as first from './a.mjs'
import * as second from './b.mjs'
test('parallel inputs join one dependency and retain their native namespaces', async () => {
  expect(globalThis.firstParallelArrivals).toEqual(['first', 'second'])
  expect(globalThis.secondParallelArrivals).toEqual(['first', 'second'])
  expect(globalThis.parallelDependencyEvaluations).toBe(1)
  expect(first.value).toBe(1)
  expect(second.value).toBe(2)
  expect(globalThis.firstParallelNamespace).toBe(first)
  expect(globalThis.secondParallelNamespace).toBe(second)
  expect(await import('./a.mjs')).toBe(first)
  expect(await import('./b.mjs')).toBe(second)
})
