import { createNextDescribe } from 'e2e-utils'
import { check, hasRedbox, waitFor } from 'next-test-utils'

createNextDescribe(
  'app dir',
  {
    files: __dirname,
  },
  ({ next, isNextDev: isDev, isNextStart }) => {
    if (isNextStart) {
      describe('Loading', () => {
        it('should render loading.js in initial html for slow page', async () => {
          const $ = await next.render$('/page-with-loading')
          expect($('#loading').text()).toBe('Loading...')
        })
      })
    }

    if (isDev) {
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
  }
)
