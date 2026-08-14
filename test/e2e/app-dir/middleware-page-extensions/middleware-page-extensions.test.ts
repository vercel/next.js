import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('middleware-page-extensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should execute middleware.page.ts and set custom header', async () => {
    const res = await next.fetch('/headers')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('hello-from-middleware')
  })

  it('should render the page through the middleware', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('hello from middleware-page-extensions')
  })

  it('should warn that the middleware convention is deprecated in favor of proxy', async () => {
    // The deprecation warnOnce is fired the first time the middleware
    // convention is detected. nextTestSetup waits for "ready" but the log
    // may still be flushing, so poll.
    await retry(async () => {
      expect(next.cliOutput).toContain(
        'The "middleware" file convention is deprecated. Please use "proxy" instead.'
      )
    })
  })
})
