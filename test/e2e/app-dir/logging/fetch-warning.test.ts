import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('app-dir - fetch warnings', () => {
  const { next, skipped } = nextTestSetup({
    skipDeployment: true,
    files: __dirname,
  })

  if (skipped) {
    return
  }

  beforeAll(async () => {
    // we don't need verbose logging (enabled by default in this Next app) for these tests to work
    // we avoid enabling it since it's not currently compatible with Turbopack.
    await next.stop()
    await next.deleteFile('next.config.js')
    await next.start()
    await next.fetch('/cache-revalidate')
  })

  it('should log when request input is a string', async () => {
    await retry(() => {
      expect(
        next.cliOutput.includes(
          'fetch for https://next-data-api-endpoint.vercel.app/api/random?request-string on /cache-revalidate specified "cache: force-cache" and "revalidate: 3", only one should be specified'
        )
      ).toBeTruthy()
    })
  })

  it('should log when request input is a Request instance', async () => {
    await retry(() => {
      expect(
        next.cliOutput.includes(
          'fetch for https://next-data-api-endpoint.vercel.app/api/random?request-input-cache-override on /cache-revalidate specified "cache: force-cache" and "revalidate: 3", only one should be specified.'
        )
      ).toBeTruthy()
    })
  })

  it('should not log when overriding cache within the Request object', async () => {
    await retry(() => {
      expect(
        next.cliOutput.includes(
          `fetch for https://next-data-api-endpoint.vercel.app/api/random?request-input on /cache-revalidate specified "cache: default" and "revalidate: 3", only one should be specified.`
        )
      ).toBeFalsy()
    })
  })
})
