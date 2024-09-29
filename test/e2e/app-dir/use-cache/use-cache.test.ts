// @ts-check
import { nextTestSetup } from 'e2e-utils'

describe('use-cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should cache results', async () => {
    const browser = await next.browser('/?n=1')
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1a = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL('/?n=2', next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('2')
    const random2 = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL('/?n=1&unrelated', next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1b = await browser.waitForElementByCss('#y').text()

    // The two navigations to n=1 should use a cached value.
    expect(random1a).toBe(random1b)

    // The navigation to n=2 should be some other random value.
    expect(random1a).not.toBe(random2)
  })
})
