import { nextTestSetup } from 'e2e-utils'

// `cookies()`, `headers()`, `params` and `searchParams` hand out the same
// promise for every call during a render. Next.js must not remember that
// promise in a module-level `WeakMap` that is keyed by the value: the promise
// references the value, and V8's minor garbage collections treat a `WeakMap`
// entry whose value references its key as strongly held, so the promise and
// everything it references (in Node.js before 24, every async local store of
// the request) would stay until the next major garbage collection.
// `instrumentation.ts` counts the promises that are stored in a `WeakMap`.
describe('request-api-promises', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function weakMapPromises(): Promise<number> {
    const res = await next.fetch('/api/weak-map-promises')
    return (await res.json()).count
  }

  it('should hand out one promise per render without storing it in a WeakMap', async () => {
    const before = await weakMapPromises()

    const res = await next.fetch('/first?query=1', {
      headers: { cookie: 'session=5f2b7c1e', 'x-test': 'header' },
    })
    const html = await res.text()
    expect(html).toContain('cookies:same:5f2b7c1e')
    expect(html).toContain('headers:same:header')
    expect(html).toContain('params:first')
    expect(html).toContain('searchParams:1')

    expect((await weakMapPromises()) - before).toBe(0)
  })
})
