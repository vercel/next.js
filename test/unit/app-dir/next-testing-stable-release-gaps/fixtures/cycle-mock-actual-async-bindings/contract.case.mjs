import { test, expect, vi } from 'vitest'
import * as a from './a.mjs'
import { readName, readNamespace, dependencyReady } from './b.mjs'
vi.mock('./b.mjs', async (original) => {
  const first = await original()
  const second = await original()
  if (first !== second) throw new Error('original namespace identity was lost')
  if (!globalThis.cyclicOriginalReady)
    throw new Error('original own await was skipped')
  if (!first.dependencyReady.done)
    throw new Error('unrelated dependency await was skipped')
  return { ...first, value: 42 }
})
test('partial cycle keeps actual completion, live bindings and namespace identity', async () => {
  expect(a.read()).toBe(42)
  expect(readNamespace()).toBe(a)
  expect(await import('./a.mjs')).toBe(a)
  expect(readNamespace().token).toBe(a.token)
  expect(readName()).toBe('first')
  a.updateName('second')
  expect(readName()).toBe('second')
  expect(dependencyReady.done).toBe(true)
})
