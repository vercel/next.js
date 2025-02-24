import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('logging-incoming-request', () => {
  const { next } = nextTestSetup({
    files: __dirname,
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
