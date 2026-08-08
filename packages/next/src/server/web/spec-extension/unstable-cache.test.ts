import { getFetchUrlPrefix } from './unstable-cache'
import type { WorkStore } from '../../app-render/work-async-storage.external'
import type { WorkUnitStore } from '../../app-render/work-unit-async-storage.external'

const workStore = { route: '/route' } as unknown as WorkStore

function requestStore(url: string): WorkUnitStore {
  const { pathname, search } = new URL(url, 'http://n')
  return { type: 'request', url: { pathname, search } } as unknown as WorkUnitStore
}

const prefixFor = (url: string) =>
  getFetchUrlPrefix(workStore, requestStore(url))

const isAscii = (value: string) => /^[\x00-\x7F]*$/.test(value)

describe('getFetchUrlPrefix', () => {
  it('sorts search params by key', () => {
    expect(prefixFor('/?b=2&a=1')).toBe('/?a=1&b=2')
  })

  it('omits the "?" when there is no search', () => {
    expect(prefixFor('/some/path')).toBe('/some/path')
  })

  it('leaves plain ASCII values readable', () => {
    expect(prefixFor('/?key=bar&extra=english')).toBe(
      '/?extra=english&key=bar'
    )
  })

  // Regression: the prefix becomes part of `fetchUrl`, which cache handlers may
  // send as an HTTP header value. Header values are ByteStrings, so any
  // codepoint above U+00FF made the header impossible to construct; handlers
  // caught the TypeError and reported it as a cache miss, silently disabling
  // the cache on every request carrying such a query value.
  // See https://github.com/vercel/next.js/issues/76286
  describe.each([
    ['CJK', '中國人'],
    ['emoji', '🎉'],
    ['Cyrillic', 'Привет'],
    // U+0100 is the first codepoint above the ByteString ceiling.
    ['first non-Latin-1 codepoint', 'Ā'],
    // Latin-1 passed the ByteString check but was still emitted raw, so the
    // header carried an ambiguous 8-bit byte.
    ['Latin-1', 'café'],
    ['last Latin-1 codepoint', 'ÿ'],
  ])('with a %s search value', (_label, value) => {
    const url = `/?key=bar&extra=${encodeURIComponent(value)}`

    it('produces an ASCII-only prefix', () => {
      expect(isAscii(prefixFor(url))).toBe(true)
    })

    it('produces a usable HTTP header value', () => {
      expect(
        () => new Headers({ 'x-cache-item-name': prefixFor(url) })
      ).not.toThrow()
    })
  })

  it('keeps repeated keys distinct', () => {
    // Previously `.get()` returned only the first value while the key was
    // emitted once per occurrence, so this collapsed to "a=1&a=1" and collided
    // with `?a=1&a=1`.
    expect(prefixFor('/?a=1&a=2')).toBe('/?a=1&a=2')
    expect(prefixFor('/?a=1&a=2')).not.toBe(prefixFor('/?a=1&a=1'))
  })

  it('falls back to the route outside a request', () => {
    expect(
      getFetchUrlPrefix(workStore, { type: 'cache' } as unknown as WorkUnitStore)
    ).toBe('/route')
  })
})
