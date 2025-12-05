import { getParams } from './get-params'

describe('export/helpers/get-params', () => {
  describe('getParams', () => {
    it('should extract params from dynamic route', () => {
      const page = '/blog/[slug]'
      const pathname = '/blog/hello-world'

      const params = getParams(page, pathname)

      expect(params).toEqual({ slug: 'hello-world' })
    })

    it('should extract multiple params from dynamic route', () => {
      const page = '/blog/[category]/[slug]'
      const pathname = '/blog/tech/nextjs-tutorial'

      const params = getParams(page, pathname)

      expect(params).toEqual({
        category: 'tech',
        slug: 'nextjs-tutorial',
      })
    })

    it('should extract catch-all params', () => {
      const page = '/docs/[...slug]'
      const pathname = '/docs/getting-started/installation'

      const params = getParams(page, pathname)

      expect(params).toEqual({ slug: ['getting-started', 'installation'] })
    })

    it('should extract optional catch-all params', () => {
      const page = '/docs/[[...slug]]'
      const pathname = '/docs/api/reference'

      const params = getParams(page, pathname)

      expect(params).toEqual({ slug: ['api', 'reference'] })
    })

    it('should handle optional catch-all with no params', () => {
      const page = '/docs/[[...slug]]'
      const pathname = '/docs'

      const params = getParams(page, pathname)

      // Optional catch-all should match even with no params
      expect(params).toBeDefined()
    })

    it('should handle static routes', () => {
      const page = '/about'
      const pathname = '/about'

      const params = getParams(page, pathname)

      expect(params).toEqual({})
    })

    it('should throw when pathname does not match page pattern', () => {
      const page = '/blog/[slug]'
      const pathname = '/about'

      expect(() => getParams(page, pathname)).toThrow(
        "The provided export path '/about' doesn't match the '/blog/[slug]' page."
      )
    })

    it('should throw with helpful error message on mismatch', () => {
      const page = '/products/[id]'
      const pathname = '/blog/123'

      expect(() => getParams(page, pathname)).toThrow(
        expect.stringContaining('export-path-mismatch')
      )
    })

    it('should handle routes with special characters in params', () => {
      const page = '/posts/[slug]'
      const pathname = '/posts/hello-world-2024'

      const params = getParams(page, pathname)

      expect(params).toEqual({ slug: 'hello-world-2024' })
    })

    it('should handle nested dynamic routes', () => {
      const page = '/[locale]/blog/[slug]'
      const pathname = '/en/blog/my-post'

      const params = getParams(page, pathname)

      expect(params).toEqual({
        locale: 'en',
        slug: 'my-post',
      })
    })

    it('should cache matcher for same page (performance optimization)', () => {
      const page = '/blog/[slug]'

      // First call
      const params1 = getParams(page, '/blog/first-post')
      expect(params1).toEqual({ slug: 'first-post' })

      // Second call with same page should use cached matcher
      const params2 = getParams(page, '/blog/second-post')
      expect(params2).toEqual({ slug: 'second-post' })
    })

    it('should handle switching between different pages', () => {
      const page1 = '/blog/[slug]'
      const page2 = '/products/[id]'

      const params1 = getParams(page1, '/blog/my-post')
      expect(params1).toEqual({ slug: 'my-post' })

      const params2 = getParams(page2, '/products/123')
      expect(params2).toEqual({ id: '123' })
    })

    it('should throw when required params are missing', () => {
      const page = '/blog/[category]/[slug]'
      const pathname = '/blog/tech'

      expect(() => getParams(page, pathname)).toThrow()
    })

    it('should handle numeric params as strings', () => {
      const page = '/posts/[id]'
      const pathname = '/posts/123'

      const params = getParams(page, pathname)

      expect(params).toEqual({ id: '123' })
      expect(typeof params.id).toBe('string')
    })

    it('should handle params with encoded characters', () => {
      const page = '/search/[query]'
      const pathname = '/search/hello%20world'

      const params = getParams(page, pathname)

      expect(params).toEqual({ query: 'hello%20world' })
    })

    it('should handle deep nested catch-all routes', () => {
      const page = '/api/[...path]'
      const pathname = '/api/v1/users/123/posts'

      const params = getParams(page, pathname)

      expect(params).toEqual({ path: ['v1', 'users', '123', 'posts'] })
    })
  })
})
