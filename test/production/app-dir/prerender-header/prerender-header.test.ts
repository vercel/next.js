import { nextTestSetup } from 'e2e-utils'

describe.each([false, true])(
  'prerender-header (cacheComponents: %s)',
  (cacheComponents) => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        cacheComponents,
        partialPrefetching: cacheComponents,
      },
    })

    it.each([
      ['HTML', {}],
      ['RSC', { RSC: '1' }],
    ])(
      'sends a single prerender header for a static %s response',
      async (_, headers) => {
        for (let request = 0; request < 2; request++) {
          const response = await next.fetch('/', { headers })
          expect(response.status).toBe(200)
          expect(response.headers.get('x-nextjs-prerender')).toBe('1')
          await response.text()
        }
      }
    )
  }
)
