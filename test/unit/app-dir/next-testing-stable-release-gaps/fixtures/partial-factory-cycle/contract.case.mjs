import { test, expect, vi } from 'vitest'
import { read } from './a.mjs'
vi.mock('./b.mjs', async (original) => ({ ...(await original()), value: 42 }))
test('partial cyclic graph retains original bindings', () =>
  expect(read()).toBe(42))
