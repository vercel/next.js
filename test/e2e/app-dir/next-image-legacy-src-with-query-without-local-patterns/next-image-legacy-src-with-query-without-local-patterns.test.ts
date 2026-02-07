import { nextTestSetup } from 'e2e-utils'

describe('next-image-legacy-src-with-query-without-local-patterns', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should throw error for relative image with query without localPatterns for legacy Image', async () => {
    if (isNextDev) {
      await next.start()
      await next.browser('/')
      expect(next.cliOutput).toContain(
        'Image with src "/test.png?v=1" is using a query string which is not configured in images.localPatterns.\nRead more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns'
      )
    } else {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(
        'Image with src "/test.png?v=1" is using a query string which is not configured in images.localPatterns.\nRead more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns'
      )
    }
  })
})
