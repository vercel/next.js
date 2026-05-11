import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('Router prefetch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should resolve prefetch promise', async () => {
    const browser = await next.browser('/')
    const text = await browser
      .elementByCss('#prefetch-button')
      .click()
      .waitForElementByCss('#hidden-until-click')
      .text()
    expect(text).toBe('visible')
    await browser.close()
  })

  if (isNextDev) {
    it('should not prefetch in development', async () => {
      const browser = await next.browser('/')
      const links = await browser
        .elementByCss('#prefetch-button')
        .click()
        .elementsByCss('link[rel=prefetch]')

      expect(links.length).toBe(0)
      await browser.close()
    })
  }
})
