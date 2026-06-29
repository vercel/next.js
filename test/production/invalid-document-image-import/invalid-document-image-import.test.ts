import { nextTestSetup } from 'e2e-utils'

// Skipped in Turbopack as Turbopack doesn't have this error as it can process these imports.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Invalid static image import in _document',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('Should fail to build when no next.config.js', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('Failed to compile')
      expect(cliOutput).toMatch(
        /Images.*cannot.*be imported within.*pages[\\/]_document\.js/
      )
      if (!process.env.NEXT_RSPACK) {
        expect(cliOutput).toMatch(/Location:.*pages[\\/]_document\.js/)
      }
    })

    it('Should fail to build when disableStaticImages in next.config.js', async () => {
      await next.patchFile(
        'next.config.js',
        `
        module.exports = {
          images: {
            disableStaticImages: true
          }
        }
      `
      )
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      if (process.env.NEXT_RSPACK) {
        expect(cliOutput).toContain(
          'You may need an appropriate loader to handle this file type'
        )
      } else {
        expect(cliOutput).toMatch(
          /You may need an appropriate loader to handle this file type, currently no loaders are configured to process this file/
        )
      }
      if (!process.env.NEXT_RSPACK) {
        expect(cliOutput).not.toMatch(
          /Images.*cannot.*be imported within.*pages[\\/]_document\.js/
        )
      }
    })
  }
)
