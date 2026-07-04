import { validateRevalidate } from 'next/dist/server/lib/patch-fetch'
import { INFINITE_CACHE } from 'next/dist/lib/constants'

describe('validateRevalidate', () => {
  it('normalizes false and Infinity to INFINITE_CACHE', () => {
    expect(validateRevalidate(false, '/route')).toBe(INFINITE_CACHE)
    expect(validateRevalidate(Infinity, '/route')).toBe(INFINITE_CACHE)
  })

  it('passes finite values through unchanged', () => {
    expect(validateRevalidate(0, '/route')).toBe(0)
    expect(validateRevalidate(60, '/route')).toBe(60)
    expect(validateRevalidate(undefined, '/route')).toBeUndefined()
  })

  it('rejects invalid values', () => {
    expect(() => validateRevalidate(-1, '/route')).toThrow('Invalid revalidate')
    expect(() => validateRevalidate('60', '/route')).toThrow(
      'Invalid revalidate'
    )
  })
})
