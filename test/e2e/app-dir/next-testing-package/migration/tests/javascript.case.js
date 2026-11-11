import { expect, inject, test, vi } from 'vitest'
import { helperExpect, shared } from '../shared-matchers.js'

test('JavaScript shares setup, matcher and assertion state', () => {
  /** @param {number} value */
  const double = (value) => value * 2
  const twice = vi.fn(double)
  expect(helperExpect).toBe(expect)
  expect(shared).toEqual({ setupCalls: 1, beforeEachCalls: 1 })
  expect(twice(21)).toBeDoubleOf(21)
  expect(twice).toHaveBeenCalledExactlyOnceWith(21)
  expect(inject('label')).toBe('installed consumer')
  console.log(
    'PACKED_MIGRATION_RAW ' +
      JSON.stringify({
        language: 'JavaScript',
        ...shared,
        calls: twice.mock.calls,
        label: inject('label'),
      })
  )
})
