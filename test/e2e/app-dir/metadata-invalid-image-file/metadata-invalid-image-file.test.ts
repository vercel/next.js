import { nextTestSetup } from 'e2e-utils'

describe('metadata-invalid-image-file', () => {
  const { next, isTurbopack, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })
  const isRspack = !!process.env.NEXT_RSPACK

  if (skipped) return

  it('should error on invalid metadata image file', async () => {
    // In dev, it needs to render the page first
    if (isNextDev) {
      await next.start()
      await next.fetch('/')
    } else {
      await next.build()
    }

    if (isTurbopack) {
      // In turbopack the image decoding error is displayed in multiple lines
      expect(next.cliOutput).toContain('app/favicon.ico')
      expect(next.cliOutput).toContain('Processing image failed')
      expect(next.cliOutput).toContain('unable to decode image data')
    } else {
      expect(next.cliOutput).toContain(
        'Error: Process image "/favicon.ico" failed:'
      )
    }

    if (!isNextDev) {
      // `next build` should fail
      if (isTurbopack) {
        expect(next.cliOutput).toContain('Build error occurred')
      } else if (isRspack) {
        expect(next.cliOutput).toContain(
          'Build failed because of Rspack errors'
        )
      } else {
        expect(next.cliOutput).toContain(
          'Build failed because of webpack errors'
        )
      }
    }
  })
})
