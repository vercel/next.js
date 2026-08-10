import { nextTestSetup } from 'e2e-utils'

describe('rewrites has condition', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should navigate to a simple rewrite without error', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.beforeNav = 1')

    await browser
      .elementByCss('#to-simple')
      .click()
      .waitForElementByCss('#another')
    expect(await browser.elementByCss('#pathname').text()).toBe('/another')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should navigate to a has rewrite without error', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.beforeNav = 1')

    await browser
      .elementByCss('#to-has-rewrite')
      .click()
      .waitForElementByCss('#another')
    expect(await browser.elementByCss('#pathname').text()).toBe('/another')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      hasQuery: 'true',
    })
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })
})
