import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('logging-incoming-request', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    ['/temporary-redirect?query=value', 307],
    ['/permanent-redirect', 308],
    ['/external-redirect', 307],
    ['/proxy-redirect', 307],
  ])('should log a redirect from %s exactly once', async (pathname, status) => {
    const cliOutput = next.getCliOutputFromHere()
    const response = await next.fetch(pathname, { redirect: 'manual' })
    expect(response.status).toBe(status)

    await retry(() => {
      expect(cliOutput().split(`GET ${pathname} ${status} in `)).toHaveLength(2)
    })
    expect(cliOutput()).not.toContain('GET /foo')
  })

  it('should not log redirects matching an ignore pattern', async () => {
    const cliOutput = next.getCliOutputFromHere()
    const response = await next.fetch('/hello-redirect', { redirect: 'manual' })
    expect(response.status).toBe(307)

    // A subsequent logged request confirms that the redirect has finished.
    await next.fetch('/foo')
    await retry(() => {
      expect(cliOutput().split('GET /foo 200 in ')).toHaveLength(2)
    })
    expect(cliOutput()).not.toContain('GET /hello-redirect')
  })

  it('should not log requests matching ignore pattern', async () => {
    // Make requests that should be ignored based on config

    let response = await next.fetch('/hello')
    expect(response.status).toBe(200)

    response = await next.fetch('/non-existent')
    expect(response.status).toBe(404)

    response = await next.fetch('/_next/static/test.js')
    expect(response.status).toBe(404)

    // Make a request that should be logged
    response = await next.fetch('/foo')
    expect(response.status).toBe(200)

    await retry(() => {
      expect(next.cliOutput).not.toContain('GET /hello')
      expect(next.cliOutput).not.toContain('GET /non-existent')
      expect(next.cliOutput).not.toContain('GET /_next/static/test.js')
      expect(next.cliOutput).toContain('GET /foo')
    })
  })
})
