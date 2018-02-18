/* global describe, it, expect */

import { parsePath, formatPath } from '../../dist/lib/url'

describe('url', () => {
  describe('parsePath', () => {
    it('should resolve path only', () => {
      expect(parsePath('/')).toEqual({
        pathname: '/',
        query: {}
      })
      expect(parsePath('')).toEqual({
        pathname: '',
        query: {}
      })
      expect(parsePath('/path')).toEqual({
        pathname: '/path',
        query: {}
      })
      expect(parsePath('path/path')).toEqual({
        pathname: 'path/path',
        query: {}
      })
    })
    it('should resolve path and query', () => {
      expect(parsePath('/path?counter=1')).toEqual({
        pathname: '/path',
        query: {
          counter: '1'
        }
      })
      expect(parsePath('path/path?')).toEqual({
        pathname: 'path/path',
        query: {}
      })
      expect(parsePath('path/path?counter=1#test')).toEqual({
        pathname: 'path/path',
        query: {
          counter: '1'
        }
      })
    })
    it('should resolve host and path', () => {
      expect(parsePath('a//host/path')).toEqual({
        pathname: '/path',
        query: {}
      })
      expect(parsePath('a//host:8000/path/path')).toEqual({
        pathname: '/path/path',
        query: {}
      })
    })
    it('should resolve host, path and query', () => {
      expect(parsePath('a//host/path?counter=1')).toEqual({
        pathname: '/path',
        query: {
          counter: '1'
        }
      })
      expect(parsePath('a//host:8000/path/path?counter=1#test')).toEqual({
        pathname: '/path/path',
        query: {
          counter: '1'
        }
      })
    })
  })

  describe('formatPath', () => {
    it('should return path only', () => {
      expect(formatPath({
        pathname: '/path'
      })).toEqual('/path')
    })
    it('should return path and query string', () => {
      expect(formatPath({
        pathname: '/path',
        query: {
          counter: '1'
        }
      })).toEqual('/path?counter=1')
    })
    it('should return path, query string, and hash', () => {
      expect(formatPath({
        pathname: '/path',
        query: {
          counter: '1'
        },
        hash: '10'
      })).toEqual('/path?counter=1#10')
    })
  })
})
