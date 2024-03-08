import { resolveUrl, resolveAbsoluteUrlWithPathname } from './resolve-url'

// required to be resolved as URL with resolveUrl()
describe('metadata: resolveUrl', () => {
  it('should return null when url is falsy', () => {
    expect(resolveUrl('', null)).toBe(null)
    expect(resolveUrl(null, null)).toBe(null)
    expect(resolveUrl(undefined, null)).toBe(null)
  })

  it('should return url itself when metadataBase is null or url is valid URL', () => {
    expect(resolveUrl('https://example.com/abc', null)).toEqual(
      new URL('https://example.com/abc')
    )
    expect(resolveUrl(new URL('https://example.com/def'), null)).toEqual(
      new URL('https://example.com/def')
    )
  })

  it('should compose with metadataBase when url is relative or absolute', () => {
    const metadataBase = new URL('https://example.com/abc')
    expect(resolveUrl('/def', metadataBase)).toEqual(
      new URL('https://example.com/abc/def')
    )

    expect(resolveUrl('../def', metadataBase)).toEqual(
      new URL('https://example.com/def')
    )

    expect(resolveUrl('foo', metadataBase)).toEqual(
      new URL('https://example.com/abc/foo')
    )
  })

  it('should ignore metadataBase when url is valid URL', () => {
    const metadataBase = new URL('https://example.com/abc')
    expect(resolveUrl('https://example.com/def', metadataBase)).toEqual(
      new URL('https://example.com/def')
    )
    expect(resolveUrl(new URL('https://bar.com/ghi'), metadataBase)).toEqual(
      new URL('https://bar.com/ghi')
    )
  })
})

describe('resolveAbsoluteUrlWithPathname', () => {
  describe('trailingSlash is false', () => {
    const metadataBase = new URL('https://example.com/')
    const opts = {
      trailingSlash: false,
      pathname: '/',
    }
    it('should resolve absolute internal url', () => {
      const url = 'https://example.com/foo'
      const resolvedUrl = resolveAbsoluteUrlWithPathname(
        url,
        metadataBase,
        opts
      )
      expect(resolvedUrl).toBe('https://example.com/foo')
    })
  })

  describe('trailingSlash is true', () => {
    const metadataBase = new URL('https://example.com/')
    const opts = {
      trailingSlash: true,
      pathname: '/',
    }
    it('should add trailing slash to relative url', () => {
      const url = '/foo'
      const resolvedUrl = resolveAbsoluteUrlWithPathname(
        url,
        metadataBase,
        opts
      )
      expect(resolvedUrl).toBe('https://example.com/foo/')
    })

    it('should add trailing slash to absolute internal url', () => {
      const url = 'https://example.com/foo'
      const resolvedUrl = resolveAbsoluteUrlWithPathname(
        url,
        metadataBase,
        opts
      )
      expect(resolvedUrl).toBe('https://example.com/foo/')
    })

    it('should not add trailing slash to external url', () => {
      const url = 'https://external.org/foo'
      const resolvedUrl = resolveAbsoluteUrlWithPathname(
        url,
        metadataBase,
        opts
      )
      expect(resolvedUrl).toBe('https://external.org/foo')
    })

    it('should not add trailing slash to absolute internal url with query', () => {
      const url = 'https://example.com/foo?bar'
      const resolvedUrl = resolveAbsoluteUrlWithPathname(
        url,
        metadataBase,
        opts
      )
      expect(resolvedUrl).toBe('https://example.com/foo?bar')
    })

    it('should not add trailing slash to relative url with query', () => {
      const url = '/foo?bar'
      const resolvedUrl = resolveAbsoluteUrlWithPathname(
        url,
        metadataBase,
        opts
      )
      expect(resolvedUrl).toBe('https://example.com/foo?bar')
    })
  })
})
