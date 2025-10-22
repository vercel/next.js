import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, retry } from 'next-test-utils'

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

        await retry(async () => {
          const headline = await browser.elementByCss('h1').text()
          expect(headline).toBe('hello from slow page')
        })

        const cliOutputLength = next.cliOutput.length

        await next.renameFile(
          'app/page-with-loading/loading.js',
          'app/page-with-loading/_loading.js'
        )

        await retry(async () => {
          expect(next.cliOutput.slice(cliOutputLength)).toInclude(
            'GET /page-with-loading 200'
          )
        })

        // It should not have an error
        await assertNoRedbox(browser)

        // HMR should still work
        await next.patchFile(
          'app/page-with-loading/page.js',
          (content) =>
            content.replace('hello from slow page', 'hello from new page'),
          async () =>
            retry(async () => {
              const headline = await browser.elementByCss('h1').text()
              expect(headline).toBe('hello from new page')
              await browser.close()
            })
        )
      })
    })
  }
})
