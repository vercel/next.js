import { nextTestSetup } from 'e2e-utils'

describe('partial prefetching with an inline server function', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('terminates the HTML response of a partially prerendered page', async () => {
    // The page renders an inline Server Function with bound args whose
    // encrypted value is served from the Resume Data Cache. Before the fix,
    // `encryptActionBoundArgs` left the request's CacheSignal read open on that
    // cache hit, so the runtime-prefetch stream embedded in the RSC payload was
    // never closed and reading the body never resolved.
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('Dynamic content')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
  })
})
