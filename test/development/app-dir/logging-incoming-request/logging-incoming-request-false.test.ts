import { nextTestSetup } from 'e2e-utils'

describe.each([false, { incomingRequests: false }])(
  'logging-incoming-request with logging: %j',
  (logging) => {
    const { next } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        'next.config.js': `
        module.exports = {
          logging: ${JSON.stringify(logging)},
          async redirects() {
            return [{ source: '/redirect', destination: '/foo', permanent: false }]
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

      response = await next.fetch('/redirect', { redirect: 'manual' })
      expect(response.status).toBe(307)

      // Collect all output before checking that request logging stayed disabled.
      await next.stop()

      // Verify no requests were logged
      expect(next.cliOutput).not.toContain('GET /')
    })
  }
)
