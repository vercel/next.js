import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('Invalid Image Import (prod)', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should fail to build with invalid image', async () => {
    await next.build()
    const output = stripAnsi(next.cliOutput)
    if (isTurbopack) {
      expect(output).toContain('Processing image failed')
      expect(output).toContain(
        'Failed to parse svg source code for image dimensions'
      )
    } else {
      expect(output).toContain(
        'Error: Image import "../public/invalid.svg" is not a valid image file. The image may be corrupted or an unsupported format.'
      )
    }
  })
})
