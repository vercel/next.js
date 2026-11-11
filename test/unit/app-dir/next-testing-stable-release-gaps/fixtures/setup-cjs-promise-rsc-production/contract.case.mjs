import { test, expect } from 'vitest'
import pending from './setup.cjs'
test('a CommonJS exported promise is a value rather than module evaluation', () => {
  expect(globalThis.releaseSetupPromiseState).toBe(1)
  expect(typeof pending.then).toBe('function')
})
