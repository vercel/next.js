import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

describe('next/font/google font file fetch error', () => {
  const isDev = (global as any).isNextDev

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'google-font-file-fetch-error/pages')),
    },
    env: {
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
    },
    skipStart: true,
  })

  it('should name the font file URL and status instead of a missing internal module', async () => {
    const missingInternalModule =
      "Can't resolve '@vercel/turbopack-next/internal/font/google/font'"

    if (isDev) {
      await next.start()
      await next.browser('/').catch(() => {})
      expect(next.cliOutput).toInclude(
        'https://fonts.gstatic.com/s/bitter/v42/this-file-does-not-exist.woff2'
      )
      expect(next.cliOutput).not.toInclude(missingInternalModule)
    } else {
      await expect(next.start()).rejects.toThrow('next build failed')
      expect(next.cliOutput).toInclude(
        'https://fonts.gstatic.com/s/bitter/v42/this-file-does-not-exist.woff2'
      )
      expect(next.cliOutput).toMatch(/Failed to fetch .*font file/i)
      expect(next.cliOutput).not.toInclude(missingInternalModule)
    }
  })
})
