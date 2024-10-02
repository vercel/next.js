import { nextTestSetup } from 'e2e-utils'

describe('scroll-behaviour-on-not-found-client-navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should scroll to top when visiting non-existent route', async () => {
    const browser = await next.browser('/')

    // scroll to bottom of the / page
    await browser.eval('window.scrollTo({top: document.body.scrollHeight})')
    const isAtBottom = await browser.eval(
      'window.innerHeight + window.scrollY >= document.documentElement.scrollHeight'
    )
    expect(isAtBottom).toBe(true)

    await browser.elementByCss('.non-existent-route').click()
    await browser.waitForElementByCss('.not-found')
    const isAtTop = await browser.eval('window.scrollY === 0')
    expect(isAtTop).toBe(true)
  })

  it('should scroll to top when visiting route that triggers notFound()', async () => {
    const browser = await next.browser('/', {
      headless: false,
    })

    // scroll to bottom of the / page
    await browser.eval('window.scrollTo({top: document.body.scrollHeight})')
    const isAtBottom = await browser.eval(
      'window.innerHeight + window.scrollY >= document.documentElement.scrollHeight'
    )
    expect(isAtBottom).toBe(true)

    await browser.elementByCss('.trigger-not-found').click()
    await browser.waitForElementByCss('.not-found')
    // await new Promise((r) => setTimeout(r, 20000))
    const isAtTop = await browser.eval('window.scrollY === 0')
    expect(isAtTop).toBe(true)
  })
})
