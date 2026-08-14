import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('proxy-page-extensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should execute proxy.page.ts and set custom header', async () => {
    const res = await next.fetch('/headers')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('hello-from-proxy')
  })

  it('should render the page through the proxy', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    // Asserting the response header proves the proxy actually ran on this
    // route — the page body alone would render even with a broken proxy.
    expect(res.headers.get('x-proxy-ran')).toBe('true')
    const html = await res.text()
    expect(html).toContain('hello from proxy-page-extensions')
  })

  it('should detect instrumentation.page.ts and run register()', async () => {
    // `register()` is invoked once during server boot, before any request is
    // served, so we don't need to make a request first. retry() handles the
    // case where the cliOutput buffer was flushed slightly after server boot.
    await retry(async () => {
      expect(next.cliOutput).toContain('instrumentation.page.ts:register')
    })
  })
})
