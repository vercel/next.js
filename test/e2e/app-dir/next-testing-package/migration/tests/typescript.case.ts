import { expect, expectTypeOf, inject, test, vi } from 'vitest'
import { helperExpect, shared } from '../shared-matchers.js'

const check = vi.defineHelper((value: number) => {
  expect(value).toBeDoubleOf(21)
})

test('TypeScript shares typed helpers and provided values', () => {
  const label = inject('label')
  expectTypeOf(label).toEqualTypeOf<string>()
  expectTypeOf(check).toEqualTypeOf<(value: number) => void>()
  expect(helperExpect).toBe(expect)
  expect(shared).toEqual({ setupCalls: 1, beforeEachCalls: 1 })
  check(42)
  expect(label).toBe('installed consumer')
  console.log(
    'PACKED_MIGRATION_RAW ' +
      JSON.stringify({ language: 'TypeScript', ...shared, label })
  )
})
