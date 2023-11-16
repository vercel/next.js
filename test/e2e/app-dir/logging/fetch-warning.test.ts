import { check } from 'next-test-utils'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir - fetch warnings',
  {
    skipDeployment: true,
    files: __dirname,
  },
  ({ next }) => {
    beforeAll(async () => {
      // we don't need verbose logging (enabled by default in this Next app) for these tests to work
      // we avoid enabling it since it's not currently compatible with Turbopack.
      await next.stop()
      await next.deleteFile('next.config.js')
      await next.start()
      await next.fetch('/cache-revalidate')
    })

    it('should log when request input is a string', async () => {
      await check(() => {
        return next.cliOutput.includes(
          'fetch for https://next-data-api-endpoint.vercel.app/api/random?request-string on /cache-revalidate specified "cache: force-cache" and "revalidate: 3", only one should be specified'
        )
          ? 'success'
          : 'fail'
      }, 'success')
    })

    it('should log when request input is a Request instance', async () => {
      await check(() => {
        return next.cliOutput.includes(
          'fetch for https://next-data-api-endpoint.vercel.app/api/random?request-input-cache-override on /cache-revalidate specified "cache: force-cache" and "revalidate: 3", only one should be specified.'
        )
          ? 'success'
          : 'fail'
      }, 'success')
    })

    it('should not log when overriding cache within the Request object', async () => {
      await check(() => {
        return next.cliOutput.includes(
          `fetch for https://next-data-api-endpoint.vercel.app/api/random?request-input on /cache-revalidate specified "cache: default" and "revalidate: 3", only one should be specified.`
        )
          ? 'fail'
          : 'success'
      }, 'success')
    })
  }
)
