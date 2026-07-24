import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('html-class-hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test: a class seeded onto <html> by an inline script before
  // hydration (the classic no-flash-of-incorrect-theme pattern) must survive
  // hydration. A dev-only React StrictMode double-invoke of effects was
  // re-acquiring the <html> host singleton after hydration, which strips every
  // attribute the script added.
  it('keeps a script-seeded <html> class after hydration', async () => {
    const browser = await next.browser('/')

    // Wait until the page's post-hydration effect has run. In dev this is after
    // the StrictMode double-invoke, so any reset of <html> has already happened.
    await browser.elementById('hydrated')

    await retry(async () => {
      expect(
        await browser.eval('document.documentElement.className')
      ).toContain('dark')
      expect(
        await browser.eval(
          'document.documentElement.getAttribute("data-seeded")'
        )
      ).toBe('1')
    })
  })

  it('keeps the class across a client-side navigation', async () => {
    const browser = await next.browser('/')
    await browser.elementById('hydrated')
    await browser.elementById('to-second').click()
    await browser.elementById('second')

    await retry(async () => {
      expect(
        await browser.eval('document.documentElement.className')
      ).toContain('dark')
    })
  })
})
