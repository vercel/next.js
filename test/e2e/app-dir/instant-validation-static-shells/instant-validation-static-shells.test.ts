import { nextTestSetup } from 'e2e-utils'
import { waitForNoErrorToast } from 'next-test-utils'
import { join } from 'node:path'

describe('instant validation - opting out of static shells', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'valid'),
    skipDeployment: true,
  })
  if (skipped) return

  // NOTE: if something's wrong in build, we'll fail before any tests run.
  // Visiting the pages is mostly just a sanity check.

  it('does not require a static shell if a root layouts is configured as blocking', async () => {
    const browser = await next.browser('/blocking-root-layout')
    await browser.elementByCss('main')
    if (isNextDev) await waitForNoErrorToast(browser)
  })
  it('does not require a static shell if a layout is configured as blocking', async () => {
    const browser = await next.browser('/blocking-layout')
    await browser.elementByCss('main')
    if (isNextDev) await waitForNoErrorToast(browser)
  })
  it('does not require a static shell if a page is configured as blocking', async () => {
    const browser = await next.browser('/blocking-page')
    await browser.elementByCss('main')
    if (isNextDev) await waitForNoErrorToast(browser)
  })
})

describe('instant validation', () => {
  describe('requires a static shell if a below a static layout page is configured as blocking', () => {
    const { next, skipped, isNextDev } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'invalid-blocking-page-below-static'),
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    if (isNextDev) {
      beforeAll(() => next.start())
      it('errors in dev', async () => {
        const browser = await next.browser('/blocking-page-below-static')
        await browser.elementByCss('main')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E1318",
           "description": "Next.js encountered uncached data during prerendering.",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/blocking-page-below-static/page.tsx (6:19) @ Page
         > 6 |   await connection()
             |                   ^",
           "stack": [
             "Page app/blocking-page-below-static/page.tsx (6:19)",
           ],
         }
        `)
      })
    } else {
      let didBuildError = false
      beforeAll(async () => {
        try {
          await next.start()
        } catch (err) {
          didBuildError = true
        }
      })
      it('errors during build', () => {
        expect(didBuildError).toBe(true)
        expect(next.cliOutput).toContain('during prerendering')
      })
    }
  })
})
