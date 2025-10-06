/* eslint-env jest */

import { isNextStart, nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource } from 'next-test-utils'

describe('Invalid Global CSS', () => {
  const { next, skipped, isTurbopack, isRspack } = nextTestSetup({
    files: __dirname,
    skipStart: isNextStart,
    skipDeployment: true,
    dependencies: { sass: '1.54.0' },
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('should fail to build', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('Failed to compile')
      expect(cliOutput).toContain('styles/global.scss')
      expect(cliOutput).toMatch(
        /Please move all first-party global CSS imports.*?pages(\/|\\)_app/
      )
      // Skip: Rspack loaders cannot access module issuer info for location details
      if (!process.env.NEXT_RSPACK) {
        expect(cliOutput).toMatch(/Location:.*pages[\\/]index\.js/)
      }
    })
  } else {
    it('should show a build error', async () => {
      const browser = await next.browser('/')

      await assertHasRedbox(browser)
      const errorSource = await getRedboxSource(browser)

      if (isTurbopack) {
        expect(errorSource).toMatchInlineSnapshot(`
         "./pages/index.js
         Failed to compile
             Global CSS cannot be imported from files other than your Custom <App>. Due to the Global nature of stylesheets, and to avoid conflicts, Please move all first-party global CSS imports to pages/_app.js. Or convert the import to Component-Level CSS (CSS Modules).
             Read more: https://nextjs.org/docs/messages/css-global
         Location: pages/index.js
         Import path: ../styles/global.scss"
        `)
      } else if (isRspack) {
        expect(errorSource).toMatchInlineSnapshot(`
         "./styles/global.scss
           │ Global CSS cannot be imported from files other than your Custom <App>. Due to the Global nature of stylesheets, and to avoid conflicts, Please move all first-party global CSS imports to pages/_app.js. Or convert the import to Component-Level CSS (CSS Modules).
           │ Read more: https://nextjs.org/docs/messages/css-global"
        `)
      } else {
        expect(errorSource).toMatchInlineSnapshot(`
         "./styles/global.scss
         Global CSS cannot be imported from files other than your Custom <App>. Due to the Global nature of stylesheets, and to avoid conflicts, Please move all first-party global CSS imports to pages/_app.js. Or convert the import to Component-Level CSS (CSS Modules).
         Read more: https://nextjs.org/docs/messages/css-global
         Location: pages/index.js"
        `)
      }
    })
  }
})
