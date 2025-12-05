import { addPathPrefix } from './add-path-prefix'

describe('shared/lib/router/utils/add-path-prefix', () => {
  describe('addPathPrefix', () => {
    it('should add prefix to path', () => {
      expect(addPathPrefix('/page', '/base')).toBe('/base/page')
    })

    it('should preserve query string', () => {
      expect(addPathPrefix('/page?query=1', '/base')).toBe('/base/page?query=1')
    })

    it('should preserve hash', () => {
      expect(addPathPrefix('/page#section', '/base')).toBe('/base/page#section')
    })

    it('should preserve query and hash', () => {
      expect(addPathPrefix('/page?query=1#section', '/base')).toBe(
        '/base/page?query=1#section'
      )
    })

    it('should return path unchanged if no prefix provided', () => {
      expect(addPathPrefix('/page', undefined)).toBe('/page')
      expect(addPathPrefix('/page', '')).toBe('/page')
    })

    it('should return path unchanged if path does not start with slash', () => {
      expect(addPathPrefix('page', '/base')).toBe('page')
      expect(addPathPrefix('relative/path', '/base')).toBe('relative/path')
    })

    it('should handle root path', () => {
      expect(addPathPrefix('/', '/base')).toBe('/base/')
    })

    it('should handle nested paths', () => {
      expect(addPathPrefix('/a/b/c', '/base')).toBe('/base/a/b/c')
    })

    it('should handle multiple query parameters', () => {
      expect(addPathPrefix('/page?a=1&b=2&c=3', '/base')).toBe(
        '/base/page?a=1&b=2&c=3'
      )
    })

    it('should handle empty query string', () => {
      expect(addPathPrefix('/page?', '/base')).toBe('/base/page?')
    })

    it('should handle empty hash', () => {
      expect(addPathPrefix('/page#', '/base')).toBe('/base/page#')
    })

    it('should handle prefix with trailing slash', () => {
      expect(addPathPrefix('/page', '/base/')).toBe('/base//page')
    })

    it('should handle complex query parameters', () => {
      expect(
        addPathPrefix('/page?url=https%3A%2F%2Fexample.com', '/base')
      ).toBe('/base/page?url=https%3A%2F%2Fexample.com')
    })

    it('should handle paths with file extensions', () => {
      expect(addPathPrefix('/file.html', '/base')).toBe('/base/file.html')
    })

    it('should handle unicode paths', () => {
      expect(addPathPrefix('/café', '/base')).toBe('/base/café')
    })

    it('should handle paths with trailing slash', () => {
      expect(addPathPrefix('/page/', '/base')).toBe('/base/page/')
    })

    it('should handle multiple slashes in path', () => {
      expect(addPathPrefix('//page', '/base')).toBe('/base//page')
    })

    it('should work with basePath-like prefixes', () => {
      expect(addPathPrefix('/docs/api', '/v2')).toBe('/v2/docs/api')
    })

    it('should work with locale prefixes', () => {
      expect(addPathPrefix('/about', '/en')).toBe('/en/about')
    })

    it('should handle complex real-world scenarios', () => {
      expect(
        addPathPrefix(
          '/blog/2023/post?utm_source=google#comments',
          '/app'
        )
      ).toBe('/app/blog/2023/post?utm_source=google#comments')
    })
  })
})
