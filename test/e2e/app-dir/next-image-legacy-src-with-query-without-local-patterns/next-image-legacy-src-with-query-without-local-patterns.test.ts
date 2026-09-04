import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('next-image-legacy-src-with-query-without-local-patterns', () => {
  const { next, isNextDev } = nextTestSetup({
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
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(
        'Image with src "/test.png?v=1" is using a query string which is not configured in images.localPatterns.\nRead more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns'
      )
    }
  })
})
