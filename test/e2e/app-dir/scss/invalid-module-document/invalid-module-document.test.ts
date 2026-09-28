/* eslint-env jest */

import { isNextDev, nextTestSetup } from 'e2e-utils'
import { waitForRedbox, getRedboxSource } from 'next-test-utils'

// Importing module CSS in _document is allowed in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Invalid SCSS in _document',
  () => {
    const { next, isRspack } = nextTestSetup({
      files: __dirname,
      skipStart: !isNextDev,
      dependencies: { sass: '1.54.0' },
    })

    if (!isNextDev) {
      it('should fail to build', async () => {
        await expect(next.start()).rejects.toThrow()
        const cliOutput = next.cliOutput

        expect(cliOutput).toContain('Failed to compile')
        expect(cliOutput).toContain('styles.module.scss')
        expect(cliOutput).toMatch(
          /CSS.*cannot.*be imported within.*pages[\\/]_document\.js/
        )
        // Skip: Rspack loaders cannot access module issuer info for location details
        if (!process.env.NEXT_RSPACK) {
          expect(cliOutput).toMatch(/Location:.*pages[\\/]_document\.js/)
        }
      }, 240_000)
    } else {
      it('should show a build error', async () => {
        const browser = await next.browser('/')

        await waitForRedbox(browser)
        const errorSource = await getRedboxSource(browser)

        if (isRspack) {
          expect(errorSource).toMatchInlineSnapshot(`
           "./styles.module.scss
             │ CSS cannot be imported within pages/_document.js. Please move global styles to pages/_app.js."
          `)
        } else {
          expect(errorSource).toMatchInlineSnapshot(`
           "./styles.module.scss
           CSS cannot be imported within pages/_document.js. Please move global styles to pages/_app.js.
           Location: pages/_document.js"
          `)
        }
      })
    }
  }
)
