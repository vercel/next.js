/* eslint-env jest */

import { isNextStart, nextTestSetup } from 'e2e-utils'
import { waitForRedbox, getRedboxSource } from 'next-test-utils'

// Importing module CSS in _document is allowed in Turbopack
// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely expects a local build failure instead of a successful deployment.
// @force-gate !deploy
// @force-gate !turbopack
describe('Invalid SCSS in _document', () => {
  const { next, isRspack } = nextTestSetup({
    files: __dirname,
    skipStart: isNextStart,
    dependencies: { sass: '1.54.0' },
  })

  if (isNextStart) {
    it('should fail to build', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('Failed to compile')
      expect(cliOutput).toContain('styles.module.scss')
      expect(cliOutput).toMatch(
        /CSS.*cannot.*be imported within.*pages[\\/]_document\.js/
      )
      // Skip: Rspack loaders cannot access module issuer info for location details
      if (!process.env.NEXT_RSPACK) {
        expect(cliOutput).toMatch(/Location:.*pages[\\/]_document\.js/)
      }
    })
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
})
