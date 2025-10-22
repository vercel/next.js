import { nextTestSetup } from 'e2e-utils'
import type { Playwright } from 'next-webdriver'

describe('parallel-routes-catchall-css', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getChildrenBackgroundColor(browser: Playwright) {
    return browser.eval(
      `window.getComputedStyle(document.getElementById('main')).backgroundColor`
    )
  }

  async function getSlotBackgroundColor(browser: Playwright) {
    return browser.eval(
      `window.getComputedStyle(document.getElementById('slot')).backgroundColor`
    )
  }

  it('should properly load the Head content from multiple leaf segments', async () => {
    const browser = await next.browser('/')

    // the page background should be blue
    expect(await getChildrenBackgroundColor(browser)).toBe('rgb(0, 0, 255)')

    expect(await browser.elementByCss('title').text()).toBe('Home Page')
    expect(await browser.elementsByCss('title')).toHaveLength(1)

    // navigate to the page that matches a parallel route
    await browser.elementByCss("[href='/nested']").click()
    await browser.waitForElementByCss('#slot')

    // the slot's background color should be red
    expect(await getSlotBackgroundColor(browser)).toBe('rgb(255, 0, 0)')

    // the main element should either not exist or not be visible
    const mainDisplay = await browser.eval(
      `document.querySelector('#main') ? window.getComputedStyle(document.querySelector('#main')).display : null`
    )
    expect(mainDisplay === null || mainDisplay === 'none').toBe(true)

    // the slot background should still be red on a fresh load
    await browser.refresh()
    expect(await getSlotBackgroundColor(browser)).toBe('rgb(255, 0, 0)')

    // when we navigate from the route that matched the catch-all, we should see the CSS for the main element
    await browser.elementByCss("[href='/']").click()
    await browser.waitForElementByCss('#main')

    expect(await getChildrenBackgroundColor(browser)).toBe('rgb(0, 0, 255)')
  })
})
