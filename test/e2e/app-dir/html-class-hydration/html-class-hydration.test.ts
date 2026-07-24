import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('html-class-hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for a dev-mode issue where a class seeded onto <html> by
  // an inline script (before hydration) was stripped shortly after hydration.
  it('keeps a script-seeded <html> class after hydration', async () => {
    const browser = await next.browser('/')
    await browser.elementById('home')

    await retry(async () => {
      expect(
        await browser.eval(
          'document.documentElement.getAttribute("data-seeded")'
        )
      ).toBe('1')
      expect(
        await browser.eval('document.documentElement.className')
      ).toContain('dark')
    })

    // Ensure it stays put after post-hydration effects/commits have settled.
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
    await browser.elementById('home')
    await browser.elementById('to-second').click()
    await browser.elementById('second')

    await retry(async () => {
      expect(
        await browser.eval('document.documentElement.className')
      ).toContain('dark')
    })
  })
})
