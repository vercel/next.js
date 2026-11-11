import { expect, test, vi, vitest } from 'vitest'
import { observeMocked } from './identity-observations.ts'

// Prepared unchanged reference/Next body. No actual public runner is launched by
// the component preparation/check gate; this is reserved for a later release.
const moduleItem = { value: 'module' }
const moduleIdentity = Object.is(vi.mocked(moduleItem), moduleItem)
const { mocked } = vi

test('mocked preserves identity without observing values or options', () => {
  expect(moduleIdentity).toBe(true)
  expect(mocked).toBe(vi.mocked)
  expect(mocked).toBe(vitest.mocked)
  expect(observeMocked(mocked)).toEqual({
    primitiveRows: 14,
    identities: Array(14).fill(true),
    optionRows: 16,
    optionIdentities: Array(16).fill(true),
    extraArgumentsIgnored: true,
    observations: Array.from({ length: 6 }, () => ({
      same: true,
      traps: 0,
      error: null,
    })),
    foreignReceiverIgnored: true,
    nonconstructable: true,
    name: 'mocked',
    length: 1,
    originalIsStillOrdinary: true,
  })
})

test('mocked preserves an existing real mock and its chain', () => {
  const mock = vi.fn((value) => value * 2)
  expect(mock(3)).toBe(6)
  const result = mocked(mock, { deep: true, partial: true })
  expect(result).toBe(mock)
  expect(result.mock.calls).toEqual([[3]])
  expect(result.mockReturnValue(8)).toBe(mock)
  expect(mock(4)).toBe(8)
})
