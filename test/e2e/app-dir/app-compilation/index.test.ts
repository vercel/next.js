import { nextTestSetup } from 'e2e-utils'
import { check, hasRedbox, waitFor } from 'next-test-utils'

describe('app dir', () => {
  const { next, isNextDev, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    // This is skipped when deployed because there are no assertions outside of next start/next dev
    skipDeployment: true,
  })

  if (skipped) return

  if (isNextStart) {
    describe('Loading', () => {
      it('should render loading.js in initial html for slow page', async () => {
        const $ = await next.render$('/page-with-loading')
        expect($('#loading').text()).toBe('Loading...')
      })
    })
  }

  if (isNextDev) {
    describe('HMR', () => {
      it('should not cause error when removing loading.js', async () => {
        const browser = await next.browser('/page-with-loading')
        await check(
          () => browser.elementByCss('h1').text(),
          'hello from slow page'
        )

        await next.renameFile(
          'app/page-with-loading/loading.js',
          'app/page-with-loading/_loading.js'
        )

        await waitFor(1000)

        // It should not have an error
        expect(await hasRedbox(browser)).toBe(false)

        // HMR should still work
        const code = await next.readFile('app/page-with-loading/page.js')
        await next.patchFile(
          'app/page-with-loading/page.js',
          code.replace('hello from slow page', 'hello from new page')
        )
        await check(
          () => browser.elementByCss('h1').text(),
          'hello from new page'
        )
      })
    })
  }
})
