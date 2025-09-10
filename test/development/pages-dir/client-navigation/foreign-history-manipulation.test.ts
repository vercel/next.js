/* eslint-env jest */

import { assertNoRedbox, waitFor } from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Client navigation with foreign history manipulation', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  it('should ignore history state without options', async () => {
    const browser = await next.browser('/nav')
    // push history object without options
    await browser.eval(
      'window.history.pushState({ url: "/whatever" }, "", "/whatever")'
    )
    await browser.elementByCss('#about-link').click()
    await browser.waitForElementByCss('.nav-about')
    await browser.back()
    await waitFor(1000)
    await assertNoRedbox(browser)
  })

  it('should ignore history state with an invalid url', async () => {
    const browser = await next.browser('/nav')
    // push history object wit invalid url (not relative)
    await browser.eval(
      'window.history.pushState({ url: "http://google.com" }, "", "/whatever")'
    )
    await browser.elementByCss('#about-link').click()
    await browser.waitForElementByCss('.nav-about')
    await browser.back()
    await waitFor(1000)
    await assertNoRedbox(browser)
  })

  it('should ignore foreign history state with missing properties', async () => {
    const browser = await next.browser('/nav')
    // push empty history state
    await browser.eval('window.history.pushState({}, "", "/whatever")')
    await browser.elementByCss('#about-link').click()
    await browser.waitForElementByCss('.nav-about')
    await browser.back()
    await waitFor(1000)
    await assertNoRedbox(browser)
  })
})
