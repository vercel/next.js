import {
  resolveUrl,
  resolveAbsoluteUrlWithPathname,
  getSocialImageMetadataBaseFallback,
} from './resolve-url'

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
      isStaticMetadataRouteFile: false,
    }
    const resolver = (url: string | URL) =>
      resolveAbsoluteUrlWithPathname(url, metadataBase, opts)
    it('should resolve absolute internal url', () => {
      expect(resolver('https://example.com/foo')).toBe(
        'https://example.com/foo'
      )
    })
  })

  describe('trailingSlash is true', () => {
    const metadataBase = new URL('https://example.com/')
    const opts = {
      trailingSlash: true,
      pathname: '/',
      isStaticMetadataRouteFile: false,
    }
    const resolver = (url: string | URL) =>
      resolveAbsoluteUrlWithPathname(url, metadataBase, opts)
    it('should add trailing slash to relative url', () => {
      expect(resolver('/foo')).toBe('https://example.com/foo/')
    })

    it('should add trailing slash to absolute internal url', () => {
      expect(resolver('https://example.com/foo')).toBe(
        'https://example.com/foo/'
      )
      expect(resolver(new URL('https://example.com/foo'))).toBe(
        'https://example.com/foo/'
      )
    })

    it('should not add trailing slash to external url', () => {
      expect(resolver('https://external.org/foo')).toBe(
        'https://external.org/foo'
      )
      expect(resolver(new URL('https://external.org/foo'))).toBe(
        'https://external.org/foo'
      )
    })

    it('should not add trailing slash to absolute internal url with query', () => {
      expect(resolver('https://example.com/foo?bar')).toBe(
        'https://example.com/foo?bar'
      )
      expect(resolver(new URL('https://example.com/foo?bar'))).toBe(
        'https://example.com/foo?bar'
      )
    })

    it('should not add trailing slash to relative url with query', () => {
      expect(resolver('/foo?bar')).toBe('https://example.com/foo?bar')
      expect(resolver(new URL('/foo?bar', metadataBase))).toBe(
        'https://example.com/foo?bar'
      )
    })

    it('should not add trailing slash to relative url that matches file pattern', () => {
      expect(resolver('/foo.html')).toBe('https://example.com/foo.html')
      expect(resolver('/foo.html?q=v')).toBe('https://example.com/foo.html?q=v')
      expect(resolver(new URL('/.well-known/bar.jpg', metadataBase))).toBe(
        'https://example.com/.well-known/bar.jpg/'
      )
      expect(resolver(new URL('/foo.html', metadataBase))).toBe(
        'https://example.com/foo.html'
      )
    })
  })
})

describe('getSocialImageFallbackMetadataBase', () => {
  describe('fallbackMetadataBase when metadataBase is not present', () => {
    let originalEnv: NodeJS.ProcessEnv
    function getSocialImageFallbackMetadataBaseHelper(): string {
      return getSocialImageMetadataBaseFallback(null).href
    }

    beforeEach(() => {
      originalEnv = process.env
    })

    afterEach(() => {
      delete process.env.VERCEL_URL
      delete process.env.VERCEL_ENV
      delete process.env.VERCEL_BRANCH_URL
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL

      process.env = originalEnv
    })

    it('should return localhost url in local dev mode', () => {
      // @ts-expect-error override process env
      process.env.NODE_ENV = 'development'
      expect(getSocialImageFallbackMetadataBaseHelper()).toBe(
        'http://localhost:3000/'
      )
    })

    it('should return local url in local build mode', () => {
      // @ts-expect-error override process env
      process.env.NODE_ENV = 'production'
      expect(getSocialImageFallbackMetadataBaseHelper()).toBe(
        'http://localhost:3000/'
      )
    })

    it('should prefer branch url in preview deployment if presents', () => {
      // @ts-expect-error override process env
      process.env.NODE_ENV = 'production'
      process.env.VERCEL_ENV = 'preview'
      process.env.VERCEL_BRANCH_URL = 'branch-url'
      process.env.VERCEL_URL = 'vercel-url'
      expect(getSocialImageFallbackMetadataBaseHelper()).toBe(
        'https://branch-url/'
      )
    })

    it('should return vercel url in preview deployment if only it presents', () => {
      // @ts-expect-error override process env
      process.env.NODE_ENV = 'production'
      process.env.VERCEL_ENV = 'preview'
      process.env.VERCEL_URL = 'vercel-url'
      expect(getSocialImageFallbackMetadataBaseHelper()).toBe(
        'https://vercel-url/'
      )
    })

    it('should return project production url in production deployment', () => {
      // @ts-expect-error override process env
      process.env.NODE_ENV = 'production'
      process.env.VERCEL_ENV = 'production'
      process.env.VERCEL_URL = 'vercel-url'
      process.env.VERCEL_PROJECT_PRODUCTION_URL = 'production-url'
      expect(getSocialImageFallbackMetadataBaseHelper()).toBe(
        'https://production-url/'
      )
    })
  })
})
