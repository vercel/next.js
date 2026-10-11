import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

// Turbopack only: with mocked responses, webpack does not download font files.
// Deploy mode exclusion: This suite intentionally fails the build, so there is no successful deployment to exercise.
// @force-gate turbopack && !deploy
describe('next/font/google font file fetch error', () => {
  const isDev = (global as any).isNextDev
  const fetchError =
    'Received response with status 404 when requesting https://fonts.gstatic.com/s/bitter/v42/does-not-exist.woff2'
  const missingModule =
    "Can't resolve '@vercel/turbopack-next/internal/font/google/font'"

  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'google-font-file-fetch-error/pages')),
    },
    env: {
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
    },
    skipStart: true,
  })

  if (isDev) {
    it('should warn and render in dev', async () => {
      await next.start()
      const browser = await next.browser('/')
      expect(await browser.elementByCss('#bitter').text()).toInclude('Bitter')
      expect(next.cliOutput).toInclude(fetchError)
      expect(next.cliOutput).not.toInclude(missingModule)
    })
  } else {
    it('should report the failed fetch when not in dev', async () => {
      await expect(next.start()).rejects.toThrow('next build failed')
      expect(next.cliOutput).toInclude(fetchError)
      expect(next.cliOutput).not.toInclude(missingModule)
    })
  }
})
