import { createCacheKey } from './cache-key'

describe('createCacheKey', () => {
  it('creates a key from the pathname, search, and nextUrl', () => {
    const key = createCacheKey('https://example.com/foo/bar?a=1', null)
    expect(key.pathname).toBe('/foo/bar')
    expect(key.search).toBe('?a=1')
    expect(key.nextUrl).toBe(null)

    const keyWithNextUrl = createCacheKey(
      'https://example.com/foo/bar?a=1',
      '/some-intercepted-route'
    )
    expect(keyWithNextUrl.nextUrl).toBe('/some-intercepted-route')
  })

  it('normalizes repeated slashes in the pathname', () => {
    const key = createCacheKey('https://example.com/a//b///c', null)
    expect(key.pathname).toBe('/a/b/c')
  })

  it('collapses a leading double slash so the pathname cannot be re-parsed as an authority', () => {
    // A pathname that begins with `//` would be interpreted as a host when
    // passed to `new URL(pathname, location.origin)`, escaping the origin
    // that was validated when the prefetch URL was created.
    const key = createCacheKey('https://example.com//attacker.example/x', null)
    expect(key.pathname).toBe('/attacker.example/x')

    // The reconstructed request URL must stay on the original origin.
    const reconstructed = new URL(
      key.pathname + key.search,
      'https://example.com'
    )
    expect(reconstructed.origin).toBe('https://example.com')
  })
})
