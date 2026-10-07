import { nextTestSetup } from 'e2e-utils'

describe('dynamic-params-false-no-fallback-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should serve a param returned by generateStaticParams', async () => {
    const res = await next.fetch('/about')
    expect(res.status).toBe(200)

    const $ = await next.render$('/about')
    expect($('p').text()).toBe('slug: about')
  })

  it('should 404 a rejected param without reporting an internal error', async () => {
    for (const pathname of ['/not-a-known-param', '/another-unknown-param']) {
      const res = await next.fetch(pathname)
      expect(res.status).toBe(404)
    }

    // `NoFallbackError` is internal control flow that hands the request back to
    // the router. Reporting it makes every such 404 look like a server error to
    // APM tooling that watches the console.
    expect(next.cliOutput).not.toContain('NoFallbackError')
  })
})
