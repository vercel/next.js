import { validateRevalidate } from 'next/dist/server/lib/patch-fetch'

describe('validateRevalidate', () => {
  it('normalizes Infinity like false, to a finite value that survives JSON serialization', () => {
    // Both mean "never revalidate". The resolved value ends up in
    // JSON-serialized state (e.g. the fetch cache and the prerender
    // manifest), where Infinity would turn into null.
    const neverRevalidate = validateRevalidate(false, '/route')
    expect(validateRevalidate(Infinity, '/route')).toBe(neverRevalidate)
    expect(Number.isFinite(neverRevalidate)).toBe(true)
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
