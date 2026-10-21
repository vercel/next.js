import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

/**
 * Verifies that `next dev` returns 405 Method Not Allowed for non-GET/HEAD
 * requests to pages, matching `next start` behavior.
 *
 * Regression test for: https://github.com/vercel/next.js/issues/38863
 */
describe('Page responds with 405 on POST in dev mode', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        // Plain page — no getStaticProps, no getServerSideProps
        'pages/index.js': `
          export default function Page() {
            return <h1>Home</h1>
          }
        `,
        // SSG page — has getStaticProps
        'pages/ssg.js': `
          export default function SSGPage() {
            return <h1>SSG Page</h1>
          }
          export async function getStaticProps() {
            return { props: {} }
          }
        `,
        // SSR page — has getServerSideProps (should NOT return 405)
        'pages/ssr.js': `
          export default function SSRPage() {
            return <h1>SSR Page</h1>
          }
          export async function getServerSideProps() {
            return { props: {} }
          }
        `,
        // API route — should NOT be affected by page-level 405 logic
        'pages/api/hello.js': `
          export default function handler(req, res) {
            res.status(200).json({ name: 'hello' })
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  describe('plain page (no data fetching)', () => {
    it('should return 405 for POST requests', async () => {
      const res = await fetchViaHTTP(next.url, '/', undefined, {
        method: 'POST',
      })
      expect(res.status).toBe(405)
      expect(res.headers.get('allow')).toBe('GET, HEAD')
    })

    it('should return 405 for PUT requests', async () => {
      const res = await fetchViaHTTP(next.url, '/', undefined, {
        method: 'PUT',
      })
      expect(res.status).toBe(405)
    })

    it('should return 200 for GET requests', async () => {
      const res = await fetchViaHTTP(next.url, '/')
      expect(res.status).toBe(200)
    })

    it('should return 200 for HEAD requests', async () => {
      const res = await fetchViaHTTP(next.url, '/', undefined, {
        method: 'HEAD',
      })
      expect(res.status).toBe(200)
    })
  })

  describe('SSG page (with getStaticProps)', () => {
    it('should return 405 for POST requests', async () => {
      const res = await fetchViaHTTP(next.url, '/ssg', undefined, {
        method: 'POST',
      })
      expect(res.status).toBe(405)
    })

    it('should return 200 for GET requests', async () => {
      const res = await fetchViaHTTP(next.url, '/ssg')
      expect(res.status).toBe(200)
    })
  })

  describe('SSR page (with getServerSideProps)', () => {
    // SSR pages may need to handle POST for form submissions or server
    // actions, so they should NOT return 405. This test documents that
    // behavior is preserved.
    it('should return 200 for POST requests', async () => {
      const res = await fetchViaHTTP(next.url, '/ssr', undefined, {
        method: 'POST',
      })
      expect(res.status).toBe(200)
    })

    it('should return 200 for GET requests', async () => {
      const res = await fetchViaHTTP(next.url, '/ssr')
      expect(res.status).toBe(200)
    })
  })

  describe('API routes are not affected', () => {
    it('should return 200 for POST to API route', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/api/hello',
        undefined,
        { method: 'POST' }
      )
      expect(res.status).toBe(200)
    })
  })
})
