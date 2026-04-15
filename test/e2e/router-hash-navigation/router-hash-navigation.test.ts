import { nextTestSetup } from 'e2e-utils'

describe('router hash navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('scrolls to top when href="/" and url already contains a hash', async () => {
    const browser = await next.browser('/#section')
    expect(await browser.eval(() => window.scrollY)).not.toBe(0)
    await browser.elementByCss('#top-link').click()
    expect(await browser.eval(() => window.scrollY)).toBe(0)
    await browser.close()
  })
})
