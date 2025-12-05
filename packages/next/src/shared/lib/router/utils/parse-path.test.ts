import { parsePath } from './parse-path'

describe('shared/lib/router/utils/parse-path', () => {
  describe('parsePath', () => {
    it('should parse path with pathname only', () => {
      expect(parsePath('/foo/bar')).toEqual({
        pathname: '/foo/bar',
        query: '',
        hash: '',
      })
    })

    it('should parse path with pathname and query', () => {
      expect(parsePath('/foo/bar?id=1&name=test')).toEqual({
        pathname: '/foo/bar',
        query: '?id=1&name=test',
        hash: '',
      })
    })

    it('should parse path with pathname and hash', () => {
      expect(parsePath('/foo/bar#section')).toEqual({
        pathname: '/foo/bar',
        query: '',
        hash: '#section',
      })
    })

    it('should parse path with pathname, query, and hash', () => {
      expect(parsePath('/foo/bar?id=1#section')).toEqual({
        pathname: '/foo/bar',
        query: '?id=1',
        hash: '#section',
      })
    })

    it('should handle empty path', () => {
      expect(parsePath('')).toEqual({
        pathname: '',
        query: '',
        hash: '',
      })
    })

    it('should handle root path', () => {
      expect(parsePath('/')).toEqual({
        pathname: '/',
        query: '',
        hash: '',
      })
    })

    it('should handle query without pathname', () => {
      expect(parsePath('?query=value')).toEqual({
        pathname: '',
        query: '?query=value',
        hash: '',
      })
    })

    it('should handle hash without pathname', () => {
      expect(parsePath('#hash')).toEqual({
        pathname: '',
        query: '',
        hash: '#hash',
      })
    })

    it('should handle multiple query parameters', () => {
      expect(parsePath('/path?a=1&b=2&c=3')).toEqual({
        pathname: '/path',
        query: '?a=1&b=2&c=3',
        hash: '',
      })
    })

    it('should handle query parameters with encoded values', () => {
      expect(parsePath('/path?url=https%3A%2F%2Fexample.com')).toEqual({
        pathname: '/path',
        query: '?url=https%3A%2F%2Fexample.com',
        hash: '',
      })
    })

    it('should handle hash with special characters', () => {
      expect(parsePath('/path#section-1.2')).toEqual({
        pathname: '/path',
        query: '',
        hash: '#section-1.2',
      })
    })

    it('should prioritize query over hash when both are present', () => {
      expect(parsePath('/path?query=1#hash')).toEqual({
        pathname: '/path',
        query: '?query=1',
        hash: '#hash',
      })
    })

    it('should handle nested paths', () => {
      expect(parsePath('/a/b/c/d?e=f#g')).toEqual({
        pathname: '/a/b/c/d',
        query: '?e=f',
        hash: '#g',
      })
    })

    it('should handle paths with file extensions', () => {
      expect(parsePath('/path/to/file.html?query=1#hash')).toEqual({
        pathname: '/path/to/file.html',
        query: '?query=1',
        hash: '#hash',
      })
    })

    it('should handle empty query string', () => {
      expect(parsePath('/path?')).toEqual({
        pathname: '/path',
        query: '?',
        hash: '',
      })
    })

    it('should handle empty hash', () => {
      expect(parsePath('/path#')).toEqual({
        pathname: '/path',
        query: '',
        hash: '#',
      })
    })

    it('should handle question mark in hash', () => {
      // Hash comes before query, so everything after # is hash
      expect(parsePath('/path#section?not=query')).toEqual({
        pathname: '/path',
        query: '',
        hash: '#section?not=query',
      })
    })

    it('should handle hash mark in query value', () => {
      // Query comes first, so # in value should be encoded
      expect(parsePath('/path?url=%23test#hash')).toEqual({
        pathname: '/path',
        query: '?url=%23test',
        hash: '#hash',
      })
    })

    it('should handle complex real-world paths', () => {
      expect(
        parsePath('/blog/2023/12/my-post?utm_source=google&utm_medium=cpc#comments')
      ).toEqual({
        pathname: '/blog/2023/12/my-post',
        query: '?utm_source=google&utm_medium=cpc',
        hash: '#comments',
      })
    })

    it('should handle relative paths', () => {
      expect(parsePath('../relative/path?query=1')).toEqual({
        pathname: '../relative/path',
        query: '?query=1',
        hash: '',
      })
    })

    it('should handle dot segments', () => {
      expect(parsePath('/./path/./to/../file?query=1')).toEqual({
        pathname: '/./path/./to/../file',
        query: '?query=1',
        hash: '',
      })
    })

    it('should handle trailing slash', () => {
      expect(parsePath('/path/?query=1#hash')).toEqual({
        pathname: '/path/',
        query: '?query=1',
        hash: '#hash',
      })
    })

    it('should handle multiple slashes', () => {
      expect(parsePath('//path//to//file?query=1')).toEqual({
        pathname: '//path//to//file',
        query: '?query=1',
        hash: '',
      })
    })

    it('should handle unicode characters in pathname', () => {
      expect(parsePath('/café/文档?query=1#hash')).toEqual({
        pathname: '/café/文档',
        query: '?query=1',
        hash: '#hash',
      })
    })

    it('should handle spaces in query', () => {
      expect(parsePath('/path?name=hello world#hash')).toEqual({
        pathname: '/path',
        query: '?name=hello world',
        hash: '#hash',
      })
    })
  })
})
