import { test, expect, vi, vitest } from 'vitest'
import { observed } from '../subject'

const tools = vi

test('the next file sees the original graph and fresh global state', () => {
  expect(observed).toEqual({
    value: 'original',
    untouched: 'kept',
    fromLeaf: 'original leaf',
  })
  expect(globalThis.__nextFactoryCalls).toBeUndefined()
  expect(vi).toBe(vitest)
  expect(tools.fn(() => 'ordinary API alias')()).toBe('ordinary API alias')
})
