import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The dev server serves requests before its file watcher finished the initial
// scan of the project. Routes, the proxy and rewrites must still be in place
// for the very first requests, and files changed right after startup must
// still be picked up.
describe('dev-startup-route-discovery', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('applies the proxy and serves the app router on the first request', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-proxy')).toBe('yes')
    expect(await res.text()).toContain('hello world')
  })

  it('serves app, pages and API routes', async () => {
    const dynamic = await next.fetch('/dynamic/first')
    expect(dynamic.status).toBe(200)
    expect(await dynamic.text()).toContain('dynamic page')

    const routeHandler = await next.fetch('/api/hello')
    expect(routeHandler.status).toBe(200)
    expect(await routeHandler.json()).toEqual({ hello: 'route handler' })

    const legacy = await next.fetch('/legacy')
    expect(legacy.status).toBe(200)
    expect(await legacy.text()).toContain('legacy page')

    const api = await next.fetch('/api/ping')
    expect(api.status).toBe(200)
    expect(await api.json()).toEqual({ ping: 'pong' })
  })

  it('applies rewrites', async () => {
    const before = await next.fetch('/before-rewrite')
    expect(before.status).toBe(200)
    expect(await before.text()).toContain('legacy page')

    const after = await next.fetch('/after-rewrite')
    expect(after.status).toBe(200)
    expect(await after.text()).toContain('hello world')

    const fallback = await next.fetch('/fallback-rewrite/second')
    expect(fallback.status).toBe(200)
    expect(await fallback.text()).toContain('dynamic page')
  })

  it('returns 404 for unknown routes', async () => {
    const res = await next.fetch('/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.headers.get('x-proxy')).toBe('yes')
  })

  it('lists the pages router routes in the dev pages manifest', async () => {
    const res = await next.fetch(
      '/_next/static/development/_devPagesManifest.json'
    )
    expect(res.status).toBe(200)
    const { pages } = await res.json()
    expect(pages).toEqual(expect.arrayContaining(['/legacy', '/api/ping']))
    expect(pages).not.toContain('/')
  })

  it('picks up pages added and removed after startup', async () => {
    expect((await next.fetch('/added')).status).toBe(404)
    expect((await next.fetch('/added-legacy')).status).toBe(404)

    await next.patchFile(
      'app/added/page.tsx',
      'export default function Page() { return <p>added page</p> }',
      async () => {
        await next.patchFile(
          'pages/added-legacy.tsx',
          'export default function Page() { return <p>added legacy page</p> }',
          async () => {
            await retry(async () => {
              const res = await next.fetch('/added')
              expect(res.status).toBe(200)
              expect(await res.text()).toContain('added page')
            })
            await retry(async () => {
              const res = await next.fetch('/added-legacy')
              expect(res.status).toBe(200)
              expect(await res.text()).toContain('added legacy page')
            })
          }
        )
      }
    )

    // `patchFile` removes files it created once the callback finished.
    await retry(async () => {
      expect((await next.fetch('/added')).status).toBe(404)
      expect((await next.fetch('/added-legacy')).status).toBe(404)
    })
  })
})
