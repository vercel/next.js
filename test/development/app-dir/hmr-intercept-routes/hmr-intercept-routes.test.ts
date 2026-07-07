import { nextTestSetup } from 'e2e-utils'

// This only works for Turbopack HMR builds
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'hmr-intercept-routes',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should update intercept routes via HMR', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('h1').text()).toBe('Main Page')

      const parallelDefaultContent = await next.readFile(
        'fixtures/@intercept/default.js'
      )

      const parallelInterceptContent = await next.readFile(
        'fixtures/@intercept/(.)intercept/page.js'
      )

      // Read the original code of the root layout page
      const rootLayoutContent = await next.readFile('app/layout.js')
      const fixtureLayoutContent = await next.readFile('fixtures/layout.js')

      // Render the `intercept` parallel-route slot from the root layout first.
      // No `@intercept` directory exists yet, so the slot prop is undefined and
      // nothing renders for it. This is a plain Fast Refresh that does not
      // force a page reload.
      await next.patchFile('app/layout.js', fixtureLayoutContent)

      // Now create the slot. Adding a new parallel-route slot is a structural
      // change that forces a full page reload, and because the layout already
      // renders the slot, that reload serves the complete updated route tree.
      //
      // Writing the slot files before the layout edit (the reverse order) is
      // flaky: the structural reload races with the layout's Fast Refresh, and
      // under load the client's `reloading` guard can drop the in-flight
      // refresh, leaving the new slot absent until the next change.
      await next.patchFile('app/@intercept/default.js', parallelDefaultContent)
      await next.patchFile(
        'app/@intercept/(.)intercept/page.js',
        parallelInterceptContent
      )

      // Check to make sure that the main page now has the correct layout changes
      await browser.waitForElementByCss('#default-intercept')
      expect(await browser.elementById('default-intercept').text()).toBe(
        "I'm the default intercept"
      )

      // Go to the intercept route and check that the intercept worked correctly
      await browser.elementById('to-intercept').click()
      await browser.waitForElementByCss('#intercept')
      expect(await browser.elementById('intercept').text()).toBe(
        "I'm the intercept"
      )

      // Reset the file statuses
      await next.patchFile('app/layout.js', rootLayoutContent)
      await next.deleteFile('app/@intercept')
    })
  }
)
