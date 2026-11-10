import { responseToMiddlewareResult } from '../middleware'

describe('responseToMiddlewareResult', () => {
  describe('basic response handling', () => {
    it('should handle a simple response with no special headers', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'x-custom-header': 'value',
        },
      })
      const requestHeaders = new Headers({
        'user-agent': 'test',
        accept: 'text/html',
      })
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.bodySent).toBe(true)
      expect(result.responseHeaders?.get('content-type')).toBe('text/html')
      expect(result.responseHeaders?.get('x-custom-header')).toBe('value')
      expect(requestHeaders.get('content-type')).toBe('text/html')
      expect(requestHeaders.get('x-custom-header')).toBe('value')
    })

    it('should set x-middleware-refresh when no routing headers present', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'content-type': 'text/html',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.bodySent).toBe(true)
    })

    it('should handle multiple values for the same header', () => {
      const response = new Response(null, {
        status: 200,
      })
      response.headers.append('set-cookie', 'cookie1=value1')
      response.headers.append('set-cookie', 'cookie2=value2')

      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.responseHeaders).toBeDefined()
      const setCookieValues = result.responseHeaders?.get('set-cookie')
      expect(setCookieValues).toBeDefined()
    })
  })

  describe('header override handling', () => {
    it('should override request headers based on x-middleware-override-headers', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-override-headers': 'authorization,x-custom',
          'x-middleware-request-authorization': 'Bearer new-token',
          'x-middleware-request-x-custom': 'new-value',
        },
      })
      const requestHeaders = new Headers({
        authorization: 'Bearer old-token',
        'x-custom': 'old-value',
        'user-agent': 'test-agent',
        accept: 'text/html',
      })
      const url = new URL('https://example.com/test')

      responseToMiddlewareResult(response, requestHeaders, url)

      // Headers in override list should be updated
      expect(requestHeaders.get('authorization')).toBe('Bearer new-token')
      expect(requestHeaders.get('x-custom')).toBe('new-value')

      // Headers not in override list should be deleted
      expect(requestHeaders.get('user-agent')).toBeNull()
      expect(requestHeaders.get('accept')).toBeNull()
    })

    it('should handle comma-separated override headers list', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-override-headers': 'host, authorization, x-custom',
          'x-middleware-request-host': 'new-host.com',
          'x-middleware-request-authorization': 'Bearer token',
          'x-middleware-request-x-custom': 'custom-value',
        },
      })
      const requestHeaders = new Headers({
        host: 'old-host.com',
        authorization: 'old-auth',
        'x-custom': 'old-custom',
        'user-agent': 'browser',
      })
      const url = new URL('https://example.com/test')

      responseToMiddlewareResult(response, requestHeaders, url)

      expect(requestHeaders.get('host')).toBe('new-host.com')
      expect(requestHeaders.get('authorization')).toBe('Bearer token')
      expect(requestHeaders.get('x-custom')).toBe('custom-value')
      expect(requestHeaders.get('user-agent')).toBeNull()
    })

    it('should delete header when override value is null', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-override-headers': 'authorization',
        },
      })
      const requestHeaders = new Headers({
        authorization: 'Bearer token',
        'user-agent': 'test',
      })
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.responseHeaders).toBeDefined()
      expect(requestHeaders.get('authorization')).toBeNull()
    })

    it('should not include x-middleware-override-headers in response', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-override-headers': 'authorization',
          'x-middleware-request-authorization': 'Bearer token',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(
        result.responseHeaders?.get('x-middleware-override-headers')
      ).toBeNull()
      expect(
        result.responseHeaders?.get('x-middleware-request-authorization')
      ).toBeNull()
    })
  })

  describe('rewrite handling', () => {
    it('should handle x-middleware-rewrite with relative path', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-rewrite': '/new-path',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/old-path')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.rewrite).toBeDefined()
      expect(result.rewrite?.pathname).toBe('/new-path')
      expect(result.rewrite?.origin).toBe('https://example.com')
      expect(result.responseHeaders?.get('x-middleware-rewrite')).toBe(
        '/new-path'
      )
    })

    it('should handle x-middleware-rewrite with absolute same-origin URL', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-rewrite': 'https://example.com/new-path?query=value',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/old-path')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.rewrite).toBeDefined()
      expect(result.rewrite?.pathname).toBe('/new-path')
      expect(result.rewrite?.search).toBe('?query=value')
      expect(result.responseHeaders?.get('x-middleware-rewrite')).toBe(
        '/new-path?query=value'
      )
    })

    it('should handle x-middleware-rewrite with external URL', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-rewrite': 'https://external.com/path',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/old-path')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.rewrite).toBeDefined()
      expect(result.rewrite?.origin).toBe('https://external.com')
      expect(result.bodySent).toBeUndefined()
      expect(result.responseHeaders?.get('x-middleware-rewrite')).toBe(
        'https://external.com/path'
      )
    })

    it('should not include x-middleware-rewrite in final response headers', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-rewrite': '/new-path',
          'content-type': 'text/html',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/old-path')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      // x-middleware-rewrite should be filtered out
      expect(result.responseHeaders?.get('x-middleware-rewrite')).toBe(
        '/new-path'
      )
      expect(result.responseHeaders?.get('content-type')).toBe('text/html')
    })
  })

  describe('redirect handling', () => {
    it('should handle 301 permanent redirect', () => {
      const response = new Response(null, {
        status: 301,
        headers: {
          location: '/new-location',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/old-location')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.status).toBe(301)
      expect(result.redirect?.url.pathname).toBe('/new-location')
      expect(result.bodySent).toBeUndefined()
      expect(result.responseHeaders?.get('location')).toBe('/new-location')
    })

    it('should handle 302 temporary redirect', () => {
      const response = new Response(null, {
        status: 302,
        headers: {
          location: 'https://example.com/redirect',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/original')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.status).toBe(302)
      expect(result.redirect?.url.pathname).toBe('/redirect')
    })

    it('should handle 307 and 308 redirects', () => {
      const redirectStatuses = [307, 308]

      redirectStatuses.forEach((status) => {
        const response = new Response(null, {
          status,
          headers: {
            location: '/redirect',
          },
        })
        const requestHeaders = new Headers()
        const url = new URL('https://example.com/original')

        const result = responseToMiddlewareResult(response, requestHeaders, url)

        expect(result.redirect).toBeDefined()
        expect(result.redirect?.status).toBe(status)
        expect(result.bodySent).toBeUndefined()
      })
    })

    it('should handle external redirect with absolute URL', () => {
      const response = new Response(null, {
        status: 302,
        headers: {
          location: 'https://external.com/path',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/original')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.origin).toBe('https://external.com')
      expect(result.redirect?.url.pathname).toBe('/path')
      expect(result.responseHeaders?.get('location')).toBe(
        'https://external.com/path'
      )
    })

    it('should convert same-origin absolute URL to relative', () => {
      const response = new Response(null, {
        status: 301,
        headers: {
          location: 'https://example.com/new-path?foo=bar',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/old-path')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.redirect).toBeDefined()
      expect(result.responseHeaders?.get('location')).toBe('/new-path?foo=bar')
    })

    it('should not treat location header as redirect for non-redirect status codes', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          location: '/some-path',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/original')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.redirect).toBeUndefined()
      expect(result.responseHeaders?.get('location')).toBe('/some-path')
      // Non-redirect location doesn't set bodySent
      expect(result.bodySent).toBeUndefined()
    })

    it('should not treat location header as redirect for 304 status', () => {
      const response = new Response(null, {
        status: 304,
        headers: {
          location: '/cached',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/original')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.redirect).toBeUndefined()
      expect(result.responseHeaders?.get('location')).toBe('/cached')
      // Non-redirect location doesn't set bodySent
      expect(result.bodySent).toBeUndefined()
    })
  })

  describe('x-middleware-set-cookie handling', () => {
    it('should add x-middleware-set-cookie to request headers only', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-set-cookie': 'session=abc123; Path=/',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(requestHeaders.get('x-middleware-set-cookie')).toBe(
        'session=abc123; Path=/'
      )
      expect(result.responseHeaders?.get('x-middleware-set-cookie')).toBeNull()
    })

    it('should handle multiple x-middleware-set-cookie values', () => {
      const response = new Response(null, {
        status: 200,
      })
      response.headers.append('x-middleware-set-cookie', 'cookie1=value1')
      response.headers.append('x-middleware-set-cookie', 'cookie2=value2')

      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.responseHeaders).toBeDefined()
      expect(requestHeaders.get('x-middleware-set-cookie')).toBeDefined()
      expect(result.responseHeaders?.get('x-middleware-set-cookie')).toBeNull()
    })
  })

  describe('x-middleware-next handling', () => {
    it('should remove x-middleware-next from headers', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-next': '1',
          'content-type': 'text/html',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.responseHeaders?.get('x-middleware-next')).toBeNull()
      expect(result.responseHeaders?.get('content-type')).toBe('text/html')
    })

    it('should not set x-middleware-refresh when x-middleware-next is present', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-next': '1',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      // When x-middleware-next is present, refresh should not be set
      // and bodySent should not be true (middleware continues processing)
      expect(result.bodySent).toBeUndefined()
      expect(result.responseHeaders?.get('x-middleware-next')).toBeNull()
    })
  })

  describe('internal header filtering', () => {
    it('should filter out content-length from response headers', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'content-length': '12345',
          'content-type': 'text/html',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.responseHeaders?.get('content-length')).toBeNull()
      expect(result.responseHeaders?.get('content-type')).toBe('text/html')
    })

    it('should filter out x-middleware-redirect from response headers', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-redirect': '/redirect',
          'content-type': 'text/html',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.responseHeaders?.get('x-middleware-redirect')).toBeNull()
      expect(result.responseHeaders?.get('content-type')).toBe('text/html')
    })

    it('should filter out x-middleware-refresh from response headers', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-refresh': '1',
          'content-type': 'text/html',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.responseHeaders?.get('x-middleware-refresh')).toBeNull()
      expect(result.bodySent).toBe(true)
    })
  })

  describe('complex scenarios', () => {
    it('should handle rewrite with header overrides', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-rewrite': '/api/v2/endpoint',
          'x-middleware-override-headers': 'authorization',
          'x-middleware-request-authorization': 'Bearer new-token',
          'x-custom-header': 'custom-value',
        },
      })
      const requestHeaders = new Headers({
        authorization: 'Bearer old-token',
        'user-agent': 'test',
      })
      const url = new URL('https://example.com/api/v1/endpoint')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.rewrite).toBeDefined()
      expect(result.rewrite?.pathname).toBe('/api/v2/endpoint')
      expect(requestHeaders.get('authorization')).toBe('Bearer new-token')
      expect(requestHeaders.get('user-agent')).toBeNull()
      expect(result.responseHeaders?.get('x-custom-header')).toBe(
        'custom-value'
      )
    })

    it('should prioritize redirect over rewrite', () => {
      const response = new Response(null, {
        status: 302,
        headers: {
          'x-middleware-rewrite': '/rewrite-path',
          location: '/redirect-path',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/original')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      // Redirect should take precedence
      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/redirect-path')
      expect(result.bodySent).toBeUndefined()
    })

    it('should handle query parameters in rewrites', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-rewrite': '/new-path?foo=bar&baz=qux',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/old-path?original=param')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.rewrite).toBeDefined()
      expect(result.rewrite?.pathname).toBe('/new-path')
      expect(result.rewrite?.search).toBe('?foo=bar&baz=qux')
    })

    it('should preserve hash in redirects', () => {
      const response = new Response(null, {
        status: 301,
        headers: {
          location: '/new-path#section',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/old-path')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.hash).toBe('#section')
    })
  })

  describe('edge cases', () => {
    it('should handle empty response headers', () => {
      const response = new Response(null, {
        status: 200,
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.bodySent).toBe(true)
      expect(result.responseHeaders).toBeDefined()
    })

    it('should handle response with only internal headers', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'content-length': '0',
          'x-middleware-next': '1',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.responseHeaders).toBeDefined()
      expect(result.responseHeaders?.get('content-length')).toBeNull()
      expect(result.responseHeaders?.get('x-middleware-next')).toBeNull()
    })

    it('should handle malformed URLs in rewrites gracefully', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-rewrite': '/valid-path',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.rewrite).toBeDefined()
      expect(result.rewrite?.pathname).toBe('/valid-path')
    })

    it('should handle protocol-relative URLs in rewrites', () => {
      const response = new Response(null, {
        status: 200,
        headers: {
          'x-middleware-rewrite': '//external.com/path',
        },
      })
      const requestHeaders = new Headers()
      const url = new URL('https://example.com/test')

      const result = responseToMiddlewareResult(response, requestHeaders, url)

      expect(result.rewrite).toBeDefined()
    })
  })
})
