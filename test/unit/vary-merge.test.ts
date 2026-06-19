/* eslint-env jest */
import { mergeVary } from 'next/dist/server/lib/vary'

describe('mergeVary', () => {
  it('appends new values to existing ones', () => {
    expect(mergeVary('RSC, Next-Router-State-Tree', 'X-Foo')).toBe(
      'RSC, Next-Router-State-Tree, X-Foo'
    )
  })

  it('preserves an existing middleware value when merging RSC values (#85999)', () => {
    expect(
      mergeVary('X-Foo', 'RSC, Next-Router-State-Tree, Next-Router-Prefetch')
    ).toBe('X-Foo, RSC, Next-Router-State-Tree, Next-Router-Prefetch')
  })

  it('de-duplicates case-insensitively, keeping the first-seen casing', () => {
    expect(mergeVary('RSC, rsc', 'RSC, X-Foo')).toBe('RSC, X-Foo')
  })

  it('handles array existing values (Node getHeader can return string[])', () => {
    expect(mergeVary(['RSC', 'Accept-Encoding'], 'X-Foo')).toBe(
      'RSC, Accept-Encoding, X-Foo'
    )
  })

  it('merges (not shadows) when both sources share a value (edge spread case)', () => {
    // The edge handler can merge a `vary` already on the response with a
    // `vary` carried by the baseRes/metadata header spread; overlapping
    // values must collapse, not duplicate or overwrite.
    expect(mergeVary('rsc, my-custom-header', ['my-custom-header'])).toBe(
      'rsc, my-custom-header'
    )
  })

  it('ignores empty, null, and undefined inputs', () => {
    expect(mergeVary(undefined, 'X-Foo')).toBe('X-Foo')
    expect(mergeVary('RSC', undefined)).toBe('RSC')
    expect(mergeVary('', 'X-Foo')).toBe('X-Foo')
    expect(mergeVary(' , RSC , ', 'X-Foo')).toBe('RSC, X-Foo')
    expect(mergeVary(null, null)).toBe('')
  })

  it('keeps `*` as a normal token, preserving other field names', () => {
    // Next reads specific tokens (e.g. Next-URL) back out of the response
    // Vary with `.includes(...)`, so `*` must not collapse the whole header.
    expect(mergeVary('*', 'RSC')).toBe('*, RSC')
    expect(mergeVary('RSC', '*')).toBe('RSC, *')
    expect(mergeVary('*', '*')).toBe('*')
  })

  it('coerces numeric header values without throwing', () => {
    expect(mergeVary(123, 'X-Foo')).toBe('123, X-Foo')
  })
})
