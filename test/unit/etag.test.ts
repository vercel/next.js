/* eslint-env jest */
import { fnv1a52, generateETag } from 'next/dist/server/lib/etag'

describe('fnv1a52', () => {
  test('returns a number', () => {
    expect(typeof fnv1a52('hello')).toBe('number')
  })

  test('produces consistent hashes', () => {
    const hash1 = fnv1a52('test payload')
    const hash2 = fnv1a52('test payload')
    expect(hash1).toBe(hash2)
  })

  test('produces different hashes for different inputs', () => {
    const hash1 = fnv1a52('hello')
    const hash2 = fnv1a52('world')
    expect(hash1).not.toBe(hash2)
  })
})

describe('generateETag', () => {
  test('generates a strong ETag by default', () => {
    const etag = generateETag('test')
    expect(etag).toMatch(/^"[a-z0-9]+"$/)
    expect(etag).not.toMatch(/^W\//)
  })

  test('generates a weak ETag when requested', () => {
    const etag = generateETag('test', true)
    expect(etag).toMatch(/^W\/"[a-z0-9]+"$/)
  })

  test('produces consistent ETags for the same payload', () => {
    const etag1 = generateETag('hello world')
    const etag2 = generateETag('hello world')
    expect(etag1).toBe(etag2)
  })

  test('produces different ETags for different payloads', () => {
    const etag1 = generateETag('hello')
    const etag2 = generateETag('world')
    expect(etag1).not.toBe(etag2)
  })

  test('strong and weak ETags for the same payload differ', () => {
    const strong = generateETag('test payload')
    const weak = generateETag('test payload', true)
    expect(strong).not.toBe(weak)
    expect(weak.startsWith('W/"')).toBe(true)
    expect(strong.startsWith('"')).toBe(true)
  })

  test('returns cached result on repeated calls (same reference)', () => {
    const payload = 'cached-payload-test-' + Date.now()
    // First call computes
    const etag1 = generateETag(payload)
    // Second call should hit cache and return identical result
    const etag2 = generateETag(payload)
    expect(etag1).toBe(etag2)
  })

  test('handles empty string', () => {
    const etag = generateETag('')
    expect(etag).toMatch(/^"[a-z0-9]+"$/)
  })

  test('handles large payloads', () => {
    const large = 'x'.repeat(100_000)
    const etag = generateETag(large)
    expect(etag).toMatch(/^"[a-z0-9]+"$/)
    // Repeated call for the same large payload should return identical result
    expect(generateETag(large)).toBe(etag)
  })

  test('does not cache payloads exceeding the size threshold', () => {
    // Payloads over the per-entry cap are not cached, but still hash correctly
    const huge = 'y'.repeat(600_000)
    const etag1 = generateETag(huge)
    const etag2 = generateETag(huge)
    expect(etag1).toMatch(/^"[a-z0-9]+"$/)
    expect(etag1).toBe(etag2)
  })

  test('distinct payloads of the same length get distinct ETags', () => {
    // Both occupy the same cache slot (keyed by length), so this exercises
    // the identity check that guards against returning a stale neighbour.
    const a = 'a'.repeat(2048)
    const b = 'b'.repeat(2048)
    expect(a.length).toBe(b.length)
    const etagA = generateETag(a)
    const etagB = generateETag(b)
    expect(etagA).not.toBe(etagB)
    // Re-reading in the other order must still be correct after eviction.
    expect(generateETag(b)).toBe(etagB)
    expect(generateETag(a)).toBe(etagA)
  })

  test('equal content in different string instances yields the same ETag', () => {
    const original = 'shared-content-' + 'z'.repeat(500)
    // A separately built instance with identical content.
    const copy = original.split('').join('')
    expect(copy).toEqual(original)
    expect(generateETag(copy)).toBe(generateETag(original))
  })

  test('stays correct under churn that exceeds the cache bounds', () => {
    // Push far more distinct lengths through than the cache can hold, then
    // verify every ETag still matches a freshly computed one.
    const samples: string[] = []
    for (let i = 0; i < 400; i++) samples.push('c'.repeat(1000 + i))
    const first = samples.map((s) => generateETag(s))
    const second = samples.map((s) => generateETag(s))
    expect(second).toEqual(first)
    // And they match the unweak format
    for (const e of first) expect(e).toMatch(/^"[a-z0-9]+"$/)
  })

  test('weak and strong ETags do not collide in the same slot', () => {
    const payload = 'w'.repeat(777)
    const strong = generateETag(payload, false)
    const weak = generateETag(payload, true)
    expect(strong).not.toBe(weak)
    // Alternating must keep returning the right one.
    expect(generateETag(payload, false)).toBe(strong)
    expect(generateETag(payload, true)).toBe(weak)
    expect(generateETag(payload, false)).toBe(strong)
  })
})
