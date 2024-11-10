import { unstable_getResponseFromNextConfig } from './config-testing-utils'
import { getRewrittenUrl, isRewrite } from './utils'

describe('config-testing-utils', () => {
  it('returns 200 for paths that do not match', async () => {
    const response = await unstable_getResponseFromNextConfig({
      url: '/test',
      nextConfig: {},
    })
    expect(response.status).toEqual(200)
  })

  describe('redirects', () => {
    it('handles redirect', async () => {
      const response = await unstable_getResponseFromNextConfig({
        url: 'https://nextjs.org/test',
        nextConfig: {
          async redirects() {
            return [
              { source: '/test', destination: '/test2', permanent: false },
            ]
          },
        },
      })
      expect(response.status).toEqual(307)
      expect(response.headers.get('location')).toEqual(
        'https://nextjs.org/test2'
      )
    })

    it('handles redirect with params', async () => {
      const response = await unstable_getResponseFromNextConfig({
        url: 'https://nextjs.org/test/foo',
        nextConfig: {
          async redirects() {
            return [
              {
                source: '/test/:slug',
                destination: '/test2/:slug',
                permanent: false,
              },
            ]
          },
        },
      })
      expect(response.status).toEqual(307)
      expect(response.headers.get('location')).toEqual(
        'https://nextjs.org/test2/foo'
      )
    })

    it("ignores redirect that doesn't match has", async () => {
      const response = await unstable_getResponseFromNextConfig({
        url: 'https://nextjs.org/test/foo',
        nextConfig: {
          async redirects() {
            return [
              {
                source: '/test/:slug',
                destination: '/test2/:slug',
                permanent: false,
                has: [
                  {
                    type: 'header',
                    key: 'host',
                    value: 'othersite.com',
                  },
                ],
              },
            ]
          },
        },
      })
      expect(response.status).toEqual(200)
    })

    it('redirects with has and missing', async () => {
      const response = await unstable_getResponseFromNextConfig({
        url: 'https://nextjs.org/test/foo',
        nextConfig: {
          async redirects() {
            return [
              {
                source: '/test/:slug',
                destination: '/test2/:slug',
                permanent: false,
                has: [
                  {
                    type: 'host',
                    value: 'nextjs.org',
                  },
                ],
                missing: [
                  {
                    type: 'host',
                    value: 'othersite.com',
                  },
                ],
              },
            ]
          },
        },
      })
      expect(response.status).toEqual(307)
      expect(response.headers.get('location')).toEqual(
        'https://nextjs.org/test2/foo'
      )
    })

    it('redirects take precedence over rewrites', async () => {
      const response = await unstable_getResponseFromNextConfig({
        url: 'https://nextjs.org/test/foo',
        nextConfig: {
          async redirects() {
            return [
              {
                source: '/test/:slug',
                destination: '/test2/:slug',
                permanent: false,
              },
            ]
          },
          async rewrites() {
            return [
              {
                source: '/test/:path*',
                destination: 'https://example.com/:path*',
              },
            ]
          },
        },
      })
      expect(response.status).toEqual(307)
      expect(response.headers.get('location')).toEqual(
        'https://nextjs.org/test2/foo'
      )
    })
  })

  describe('rewrites', () => {
    it('handles rewrite', async () => {
      const response = await unstable_getResponseFromNextConfig({
        url: 'https://nextjs.org/test/subpath',
        nextConfig: {
          async headers() {
            return [
              {
                source: '/test/:path+',
                headers: [
                  {
                    key: 'X-Custom-Header',
                    value: 'custom-value',
                  },
                ],
              },
            ]
          },
          async rewrites() {
            return [
              {
                source: '/test/:path*',
                destination: 'https://example.com/:path*',
              },
            ]
          },
        },
      })
      expect(isRewrite(response)).toEqual(true)
      expect(getRewrittenUrl(response)).toEqual('https://example.com/subpath')
      expect(response.headers.get('x-custom-header')).toEqual('custom-value')
    })

    it('beforeFiles rewrites take precedence over afterFiles and fallback', async () => {
      const response = await unstable_getResponseFromNextConfig({
        url: 'https://nextjs.org/test/subpath',
        nextConfig: {
          async rewrites() {
            return {
              beforeFiles: [
                {
                  source: '/test/:path*',
                  destination: 'https://example.com/:path*',
                },
              ],
              afterFiles: [
                {
                  source: '/test/:path*',
                  destination: 'https://wrong-example.com/:path*',
                },
              ],
              fallback: [
                {
                  source: '/test/:path*',
                  destination: 'https://wrong-example.com/:path*',
                },
              ],
            }
          },
        },
      })
      expect(isRewrite(response)).toEqual(true)
      expect(getRewrittenUrl(response)).toEqual('https://example.com/subpath')
    })
  })

  describe('headers', () => {
    it('simple match', async () => {
      const response = await unstable_getResponseFromNextConfig({
        url: 'https://nextjs.org/test/subpath',
        nextConfig: {
          async headers() {
            return [
              {
                source: '/test/:path+',
                headers: [
                  {
                    key: 'X-Custom-Header',
                    value: 'custom-value',
                  },
                ],
              },
            ]
          },
        },
      })
      expect(response.headers.get('x-custom-header')).toEqual('custom-value')
    })
  })

  it('basePath', async () => {
    const response = await unstable_getResponseFromNextConfig({
      url: 'https://nextjs.org/test',
      nextConfig: {
        basePath: '/base-path',
        async headers() {
          return [
            {
              // When basePath is defined, basePath is automatically added to these expressions.
              source: '/:path+',
              headers: [
                {
                  key: 'X-Using-Base-Path',
                  value: '1',
                },
              ],
            },
            {
              source: '/:path+',
              headers: [
                {
                  key: 'X-Custom-Header',
                  value: '1',
                },
              ],
              basePath: false,
            },
          ]
        },
      },
    })
    expect(response.headers.get('x-custom-header')).toEqual('1')
    expect(response.headers.get('x-using-base-path')).toBeNull()
  })
})
