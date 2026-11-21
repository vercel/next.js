import { nextTestSetup } from 'e2e-utils'

// Build-failure diagnostics are covered by local build/start runs.
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
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput
      expect(cliOutput).toContain(
        'Image with src "/test.png?v=1" is using a query string which is not configured in images.localPatterns.\nRead more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns'
      )
    }
  }, 240_000)
})
