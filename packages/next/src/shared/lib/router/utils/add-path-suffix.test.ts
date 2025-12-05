import { addPathSuffix } from './add-path-suffix'

describe('shared/lib/router/utils/add-path-suffix', () => {
  describe('addPathSuffix', () => {
    it('should add suffix to pathname', () => {
      expect(addPathSuffix('/page', '.html')).toBe('/page.html')
    })

    it('should preserve query string', () => {
      expect(addPathSuffix('/page?query=1', '.html')).toBe('/page.html?query=1')
    })

    it('should preserve hash', () => {
      expect(addPathSuffix('/page#section', '.html')).toBe('/page.html#section')
    })

    it('should preserve query and hash', () => {
      expect(addPathSuffix('/page?query=1#section', '.html')).toBe(
        '/page.html?query=1#section'
      )
    })

    it('should return path unchanged if no suffix provided', () => {
      expect(addPathSuffix('/page', undefined)).toBe('/page')
      expect(addPathSuffix('/page', '')).toBe('/page')
    })

    it('should return path unchanged if path does not start with slash', () => {
      expect(addPathSuffix('page', '.html')).toBe('page')
      expect(addPathSuffix('relative/path', '.html')).toBe('relative/path')
    })

    it('should handle root path', () => {
      expect(addPathSuffix('/', '.html')).toBe('/.html')
    })

    it('should handle nested paths', () => {
      expect(addPathSuffix('/a/b/c', '.html')).toBe('/a/b/c.html')
    })

    it('should handle multiple query parameters', () => {
      expect(addPathSuffix('/page?a=1&b=2&c=3', '.html')).toBe(
        '/page.html?a=1&b=2&c=3'
      )
    })

    it('should handle trailing slash in pathname', () => {
      expect(addPathSuffix('/page/', '.html')).toBe('/page/.html')
    })

    it('should add slash suffix', () => {
      expect(addPathSuffix('/page', '/')).toBe('/page/')
    })

    it('should add slash suffix with query', () => {
      expect(addPathSuffix('/page?query=1', '/')).toBe('/page/?query=1')
    })

    it('should handle complex suffixes', () => {
      expect(addPathSuffix('/api/users', '/list')).toBe('/api/users/list')
    })

    it('should work with file extensions', () => {
      expect(addPathSuffix('/document', '.pdf')).toBe('/document.pdf')
      expect(addPathSuffix('/image', '.jpg')).toBe('/image.jpg')
      expect(addPathSuffix('/data', '.json')).toBe('/data.json')
    })

    it('should work with index suffix', () => {
      expect(addPathSuffix('/blog', '/index.html')).toBe('/blog/index.html')
    })

    it('should preserve encoded query parameters', () => {
      expect(addPathSuffix('/page?url=https%3A%2F%2Fexample.com', '.html')).toBe(
        '/page.html?url=https%3A%2F%2Fexample.com'
      )
    })

    it('should handle unicode paths', () => {
      expect(addPathSuffix('/café', '.html')).toBe('/café.html')
    })

    it('should handle empty query string', () => {
      expect(addPathSuffix('/page?', '.html')).toBe('/page.html?')
    })

    it('should handle empty hash', () => {
      expect(addPathSuffix('/page#', '.html')).toBe('/page.html#')
    })

    it('should handle paths already with extensions', () => {
      expect(addPathSuffix('/file.txt', '.backup')).toBe('/file.txt.backup')
    })

    it('should work with locale-like suffixes', () => {
      expect(addPathSuffix('/about', '/en-US')).toBe('/about/en-US')
    })

    it('should work with version suffixes', () => {
      expect(addPathSuffix('/api', '/v2')).toBe('/api/v2')
    })

    it('should handle complex real-world scenarios', () => {
      expect(
        addPathSuffix('/blog/2023/post?utm_source=google#comments', '.html')
      ).toBe('/blog/2023/post.html?utm_source=google#comments')
    })

    it('should handle multiple slashes in path', () => {
      expect(addPathSuffix('//page', '.html')).toBe('//page.html')
    })

    it('should work with data URLs pattern', () => {
      expect(addPathSuffix('/posts/123', '.json')).toBe('/posts/123.json')
    })

    it('should work with RSS feeds', () => {
      expect(addPathSuffix('/feed', '.xml')).toBe('/feed.xml')
    })
  })
})
