import {
  couldMatchAppRouterLocaleRoute,
  getAppRoutePatterns,
} from './detect-app-router-locale-route'

describe('getAppRoutePatterns', () => {
  it('should convert file paths to route patterns', () => {
    const filePaths = new Set([
      '/[lang]/page.tsx',
      '/[lang]/test/page.tsx',
      '/[lang]/blog/[slug]/page.tsx',
    ])

    const patterns = getAppRoutePatterns(filePaths)

    expect(patterns).toContain('/[lang]')
    expect(patterns).toContain('/[lang]/test')
    expect(patterns).toContain('/[lang]/blog/[slug]')
  })

  it('should handle different file extensions', () => {
    const filePaths = new Set([
      '/[lang]/page.ts',
      '/[lang]/test/page.js',
      '/[lang]/blog/page.jsx',
    ])

    const patterns = getAppRoutePatterns(filePaths)

    expect(patterns).toHaveLength(3)
    expect(patterns).toContain('/[lang]')
    expect(patterns).toContain('/[lang]/test')
    expect(patterns).toContain('/[lang]/blog')
  })

  it('should handle route handlers', () => {
    const filePaths = new Set([
      '/[lang]/api/route.ts',
      '/[lang]/api/users/route.ts',
    ])

    const patterns = getAppRoutePatterns(filePaths)

    expect(patterns).toContain('/[lang]/api')
    expect(patterns).toContain('/[lang]/api/users')
  })

  it('should filter out routes that do not start with dynamic segment', () => {
    const filePaths = new Set([
      '/[lang]/page.tsx',
      '/static/page.tsx',
      '/about/[id]/page.tsx',
    ])

    const patterns = getAppRoutePatterns(filePaths)

    // Only the one starting with [lang] should be included
    expect(patterns).toHaveLength(1)
    expect(patterns).toContain('/[lang]')
  })

  it('should handle special files (layout, loading, error, etc.)', () => {
    const filePaths = new Set([
      '/[lang]/layout.tsx',
      '/[lang]/loading.tsx',
      '/[lang]/error.tsx',
      '/[lang]/template.tsx',
      '/[lang]/not-found.tsx',
      '/[lang]/default.tsx',
    ])

    const patterns = getAppRoutePatterns(filePaths)

    // All should map to /[lang]
    expect(patterns.every((p) => p === '/[lang]')).toBe(true)
  })

  it('should handle already-normalized patterns', () => {
    // Sometimes appFiles contains already-normalized patterns
    const filePaths = new Set([
      '/[lang]/test',
      '/[lang]/about',
      '/[locale]/blog',
    ])

    const patterns = getAppRoutePatterns(filePaths)

    expect(patterns).toHaveLength(3)
    expect(patterns).toContain('/[lang]/test')
    expect(patterns).toContain('/[lang]/about')
    expect(patterns).toContain('/[locale]/blog')
  })
})

describe('couldMatchAppRouterLocaleRoute', () => {
  describe('basic dynamic segments', () => {
    it('should match pathname with locale prefix to [lang] pattern', () => {
      const result = couldMatchAppRouterLocaleRoute('/nl-NL/test', [
        '/[lang]/test',
      ])
      expect(result).toBe(true)
    })

    it('should match different locales', () => {
      const patterns = ['/[lang]/about']

      expect(couldMatchAppRouterLocaleRoute('/en-US/about', patterns)).toBe(
        true
      )
      expect(couldMatchAppRouterLocaleRoute('/nl-NL/about', patterns)).toBe(
        true
      )
      expect(couldMatchAppRouterLocaleRoute('/fr-FR/about', patterns)).toBe(
        true
      )
    })

    it('should not match when path segment does not match', () => {
      const result = couldMatchAppRouterLocaleRoute('/nl-NL/other', [
        '/[lang]/test',
      ])
      expect(result).toBe(false)
    })

    it('should match root with locale', () => {
      const result = couldMatchAppRouterLocaleRoute('/nl-NL', ['/[lang]'])
      expect(result).toBe(true)
    })
  })

  describe('nested routes', () => {
    it('should match nested static paths', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/blog/latest', [
        '/[lang]/blog/latest',
      ])
      expect(result).toBe(true)
    })

    it('should match multiple dynamic segments', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/blog/my-post', [
        '/[lang]/blog/[slug]',
      ])
      expect(result).toBe(true)
    })

    it('should not match with wrong number of segments', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/blog', [
        '/[lang]/blog/[slug]',
      ])
      expect(result).toBe(false)
    })
  })

  describe('catch-all routes', () => {
    it('should match catch-all routes', () => {
      const result = couldMatchAppRouterLocaleRoute(
        '/en-US/docs/intro/getting-started',
        ['/[lang]/docs/[...slug]']
      )
      expect(result).toBe(true)
    })

    it('should match catch-all with single segment', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/docs/intro', [
        '/[lang]/docs/[...slug]',
      ])
      expect(result).toBe(true)
    })

    it('should match catch-all with many segments', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/docs/a/b/c/d/e', [
        '/[lang]/docs/[...slug]',
      ])
      expect(result).toBe(true)
    })
  })

  describe('optional catch-all routes', () => {
    it('should match optional catch-all with segments', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/docs/intro', [
        '/[lang]/docs/[[...slug]]',
      ])
      expect(result).toBe(true)
    })

    it('should match optional catch-all without segments', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/docs', [
        '/[lang]/docs/[[...slug]]',
      ])
      expect(result).toBe(true)
    })
  })

  describe('multiple patterns', () => {
    it('should match any pattern in the list', () => {
      const patterns = ['/[lang]/about', '/[lang]/blog', '/[lang]/contact']

      expect(couldMatchAppRouterLocaleRoute('/en-US/about', patterns)).toBe(
        true
      )
      expect(couldMatchAppRouterLocaleRoute('/en-US/blog', patterns)).toBe(true)
      expect(couldMatchAppRouterLocaleRoute('/en-US/contact', patterns)).toBe(
        true
      )
    })

    it('should return false when no patterns match', () => {
      const patterns = ['/[lang]/about', '/[lang]/blog']

      const result = couldMatchAppRouterLocaleRoute('/en-US/other', patterns)
      expect(result).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle empty pathname', () => {
      const result = couldMatchAppRouterLocaleRoute('', ['/[lang]/test'])
      expect(result).toBe(false)
    })

    it('should handle empty patterns array', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/test', [])
      expect(result).toBe(false)
    })

    it('should handle pathname without locale prefix', () => {
      const result = couldMatchAppRouterLocaleRoute('/test', ['/[lang]/test'])
      expect(result).toBe(false)
    })

    it('should not match static routes', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/static', [
        '/static',
      ])
      expect(result).toBe(false)
    })

    it('should not match routes that do not start with dynamic segment', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/blog/post', [
        '/blog/[lang]/[slug]',
      ])
      expect(result).toBe(false)
    })

    it('should handle trailing slashes gracefully', () => {
      // Next.js route matcher should handle this
      const result = couldMatchAppRouterLocaleRoute('/en-US/test/', [
        '/[lang]/test',
      ])
      // This behavior depends on Next.js route matcher internals
      // Just ensure it doesn't throw
      expect(typeof result).toBe('boolean')
    })
  })

  describe('different dynamic segment names', () => {
    it('should work with [locale] instead of [lang]', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/test', [
        '/[locale]/test',
      ])
      expect(result).toBe(true)
    })

    it('should work with any dynamic segment name', () => {
      const result = couldMatchAppRouterLocaleRoute('/en-US/test', [
        '/[anything]/test',
      ])
      expect(result).toBe(true)
    })
  })

  describe('performance', () => {
    it('should handle large number of patterns efficiently', () => {
      const patterns = Array.from({ length: 100 }, (_, i) => `/[lang]/page${i}`)

      const start = Date.now()
      couldMatchAppRouterLocaleRoute('/en-US/page50', patterns)
      const duration = Date.now() - start

      // Should complete in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100)
    })
  })
})
