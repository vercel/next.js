import { parse } from 'url'
import { NodeNextRequest } from '../base-http/node'
import { MockedRequest } from '../lib/mock-request'
import { getRequestMeta } from '../request-meta'
import { MatchedPathRequestAdapter } from './matched-path-request-adapter'
import type { RouteMatch } from '../future/route-matches/route-match'
import { RouteKind } from '../future/route-kind'

function createRequest(url: string, headers: Record<string, string> = {}) {
  return new NodeNextRequest(new MockedRequest({ url, headers, method: 'GET' }))
}

describe('MatchedPathRequestAdapter', () => {
  describe('with ppr', () => {
    const adapter = new MatchedPathRequestAdapter(
      '',
      { app: true, pages: false },
      undefined,
      {
        match: (): RouteMatch => {
          return {
            definition: {
              kind: RouteKind.APP_PAGE,
              bundlePath: '',
              filename: '',
              page: '/blog/[slug]/page',
              pathname: '/blog/[slug]',
            },
            params: {},
          }
        },
      } as any,
      {
        experimental: {
          ppr: true,
        },
      } as any,
      () => {
        return {} as any
      }
    )

    it('should not detect rsc if it is not present in the url', async () => {
      const req = createRequest('/blog/post', {
        'x-matched-path': '/blog/[post].rsc',
        'x-now-route-matches': '1=post',
        rsc: '1',
      })
      const parsedURL = parse(req.url, true)

      await adapter.adapt(req, parsedURL)

      expect(parsedURL.pathname).toBe('/blog/post')
      expect(getRequestMeta(req).isRSCRequest).toBeFalsy()
      expect(getRequestMeta(req).isPrefetchRSCRequest).toBeFalsy()
      expect(req.headers['rsc']).toBeUndefined()
      expect(req.headers['next-router-prefetch']).toBeUndefined()
    })

    it('should detect rsc requests', async () => {
      const req = createRequest('/blog/post.rsc', {
        'x-matched-path': '/blog/[post].rsc',
      })
      const parsedURL = parse(req.url, true)

      await adapter.adapt(req, parsedURL)

      expect(parsedURL.pathname).toBe('/blog/post')
      expect(getRequestMeta(req).isRSCRequest).toBe(true)
      expect(getRequestMeta(req).isPrefetchRSCRequest).toBeFalsy()
      expect(req.headers['rsc']).toBe('1')
      expect(req.headers['next-router-prefetch']).toBeUndefined()
    })

    it('should detect rsc via headers requests', async () => {
      const req = createRequest('/blog/post', {
        'x-matched-path': '/blog/[post]',
        rsc: '1',
      })
      const parsedURL = parse(req.url, true)

      await adapter.adapt(req, parsedURL)

      expect(parsedURL.pathname).toBe('/blog/post')
      expect(getRequestMeta(req).isRSCRequest).toBe(true)
      expect(getRequestMeta(req).isPrefetchRSCRequest).toBeFalsy()
      expect(req.headers['rsc']).toBe('1')
      expect(req.headers['next-router-prefetch']).toBeUndefined()
    })

    it('should not detect rsc requests from headers when revalidating', async () => {
      const req = createRequest('/blog/post', {
        'x-matched-path': '/blog/[post]',
        'x-now-route-matches': '1=post',
        rsc: '1',
      })
      const parsedURL = parse(req.url, true)

      await adapter.adapt(req, parsedURL)

      expect(parsedURL.pathname).toBe('/blog/post')
      expect(getRequestMeta(req).isRSCRequest).toBeFalsy()
      expect(getRequestMeta(req).isPrefetchRSCRequest).toBeFalsy()
      expect(req.headers['rsc']).toBeUndefined()
      expect(req.headers['next-router-prefetch']).toBeUndefined()
    })

    it('should detect prefetch rsc requests', async () => {
      const req = createRequest('/blog/post.prefetch.rsc', {
        'x-matched-path': '/blog/[post].prefetch.rsc',
      })
      const parsedURL = parse(req.url, true)

      await adapter.adapt(req, parsedURL)

      expect(parsedURL.pathname).toBe('/blog/post')
      expect(getRequestMeta(req).isRSCRequest).toBe(true)
      expect(getRequestMeta(req).isPrefetchRSCRequest).toBe(true)
      expect(req.headers['rsc']).toBe('1')
      expect(req.headers['next-router-prefetch']).toBe('1')
    })

    it('should detect prefetch rsc requests from headers', async () => {
      const req = createRequest('/blog/post', {
        'x-matched-path': '/blog/[post]',
        rsc: '1',
        'next-router-prefetch': '1',
      })
      const parsedURL = parse(req.url, true)

      await adapter.adapt(req, parsedURL)

      expect(parsedURL.pathname).toBe('/blog/post')
      expect(getRequestMeta(req).isRSCRequest).toBe(true)
      expect(getRequestMeta(req).isPrefetchRSCRequest).toBe(true)
      expect(req.headers['rsc']).toBe('1')
      expect(req.headers['next-router-prefetch']).toBe('1')
    })

    it('should not detect prefetch rsc requests from headers when revalidating', async () => {
      const req = createRequest('/blog/post', {
        'x-matched-path': '/blog/[post]',
        'x-now-route-matches': '1=post',
        rsc: '1',
        'next-router-prefetch': '1',
      })
      const parsedURL = parse(req.url, true)

      await adapter.adapt(req, parsedURL)

      expect(parsedURL.pathname).toBe('/blog/post')
      expect(getRequestMeta(req).isRSCRequest).toBeFalsy()
      expect(getRequestMeta(req).isPrefetchRSCRequest).toBeFalsy()
      expect(req.headers['rsc']).toBeUndefined()
      expect(req.headers['next-router-prefetch']).toBeUndefined()
    })
  })
})
