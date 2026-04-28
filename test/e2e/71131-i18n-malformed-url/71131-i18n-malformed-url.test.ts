import { nextTestSetup } from 'e2e-utils'

describe('71131-i18n-malformed-url', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not throw "Invalid URL" when receiving a malformed URL with backslashes', async () => {
    // The original repro from issue #71131:
    // curl -k 'http://localhost:3000/\\\%20../%20../%20../%20../%20../%20../foobar'
    // Before the fix this caused a TypeError [ERR_INVALID_URL] in router-server.ts
    // because `replace(/^\/+/, '/')` only normalized leading forward slashes,
    // leaving backslashes that broke `new URL()`.
    const res = await next.fetch(
      '/\\\\\\%20../%20../%20../%20../%20../%20../foobar'
    )

    // The response itself should not be a 500 (it should redirect or 404).
    expect(res.status).not.toBe(500)

    // More importantly, the server should not log an "Invalid URL" TypeError.
    expect(next.cliOutput).not.toContain('Invalid URL')
    expect(next.cliOutput).not.toContain('ERR_INVALID_URL')
  })

  it('should handle other malformed URL patterns without throwing', async () => {
    const malformedUrls = ['/\\foo', '//\\bar', '/\\\\baz', '/foo\\bar']

    for (const url of malformedUrls) {
      const res = await next.fetch(url)
      expect(res.status).not.toBe(500)
    }

    expect(next.cliOutput).not.toContain('Invalid URL')
    expect(next.cliOutput).not.toContain('ERR_INVALID_URL')
  })
})
