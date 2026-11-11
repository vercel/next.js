import { test, expect, vi } from 'vitest'
import { read } from './environment.mjs'
test('stub cannot silently leave an inlined application value unchanged', () => {
  expect(read()).toBe('compiled')
  vi.stubEnv('NEXT_PUBLIC_RELEASE_STUB', 'changed')
  expect(read()).toBe('changed')
})
