import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('logging-incoming-request', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.js': `
        module.exports = {
          logging: {
            incomingRequests: false
          }
        }
      `,
    },
  })

  it('should handle disabled request logging', async () => {
    let response = await next.fetch('/foo')
    expect(response.status).toBe(200)

    response = await next.fetch('/hello')
    expect(response.status).toBe(200)

    // Wait for GET /foo to be logged
    await retry(() => {
      expect(next.cliOutput).not.toContain('GET /foo')
    })

    // Verify no requests were logged
    expect(next.cliOutput).not.toContain('GET /')
    expect(next.cliOutput).not.toContain('GET /hello')
  })
})
