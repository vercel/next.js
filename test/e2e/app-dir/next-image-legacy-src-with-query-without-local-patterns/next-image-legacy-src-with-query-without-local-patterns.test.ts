import { nextTestSetup } from 'e2e-utils'

describe('next-image-legacy-src-with-query-without-local-patterns', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should throw error for relative image with query without localPatterns for legacy Image', async () => {
    if (isNextDev) {
      await next.start()
      await next.browser('/')
      expect(next.cliOutput).toContain(
        'Image with src "/test.png?v=1" is using a query string which is not configured in images.localPatterns.\nRead more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns'
      )
    } else {
      await expect(next.start()).rejects.toThrow()
      // Deployment build logs prefix each line with an ISO timestamp.
      const cliOutput = isNextDeploy
        ? next.cliOutput.replace(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z {2}/gm,
            ''
          )
        : next.cliOutput
      expect(cliOutput).toContain(
        'Image with src "/test.png?v=1" is using a query string which is not configured in images.localPatterns.\nRead more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns'
      )
    }
  }, 240_000)
})
