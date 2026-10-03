import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'

const mockedGoogleFontResponses = require.resolve(
  './google-font-file-fetch-error/mocked-responses.js'
)

;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'next/font/google font file fetch error',
  () => {
    const isDev = (global as any).isNextDev

    if ((global as any).isNextDeploy) {
      it('should skip next deploy for now', () => {})
      return
    }

    const { next } = nextTestSetup({
      files: {
        pages: new FileRef(
          join(__dirname, 'google-font-file-fetch-error/pages')
        ),
      },
      env: {
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
      },
      skipStart: true,
    })

    it('retries and reports the font file fetch error', async () => {
      let requestCount = 0
      const server = createServer((_req, res) => {
        requestCount++
        res.statusCode = 404
        res.end('not found')
      })
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve)
      })

      const { port } = server.address() as AddressInfo
      const fontFileUrl = `http://127.0.0.1:${port}/missing.woff2`
      next.env.NEXT_FONT_GOOGLE_TEST_FONT_FILE_URL = fontFileUrl

      try {
        if (isDev) {
          await next.start()
          expect(await next.render('/')).toContain('Bitter')
        } else {
          await expect(next.start()).rejects.toThrow('next build failed')
        }

        expect(requestCount).toBe(2)
        expect(next.cliOutput).toInclude(
          `Received response with status 404 when requesting ${fontFileUrl}`
        )
        expect(next.cliOutput).not.toInclude(
          "Can't resolve '@vercel/turbopack-next/internal/font/google/font'"
        )
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })
  }
)
