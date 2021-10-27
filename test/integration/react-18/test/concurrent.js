/* eslint-env jest */

import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

export default (context, _render) => {
  async function withBrowser(path, cb) {
    let browser
    try {
      browser = await webdriver(context.appPort, path, false)
      await cb(browser)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  }

  it('should resolve suspense modules on server side if suspense', async () => {
    await withBrowser('/suspense/no-preload', async (browser) => {
      await check(() => browser.waitForElementByCss('#__next').text(), /barfoo/)
      await check(
        () => browser.eval('typeof __NEXT_DATA__.dynamicIds'),
        /undefined/
      )
    })
  })

  it.skip('should resolve suspense on server side if not suspended on server', async () => {
    await withBrowser('/suspense/no-thrown', async (browser) => {
      await check(
        () => browser.waitForElementByCss('#server-rendered').text(),
        /true/
      )
      await check(
        () => browser.eval('typeof __NEXT_DATA__.dynamicIds'),
        /undefined/
      )
    })
  })

  it.skip('should resolve suspense on server side if suspended on server', async () => {
    await withBrowser('/suspense/thrown', async (browser) => {
      await check(
        () => browser.waitForElementByCss('#server-rendered').text(),
        /true/
      )
      await check(
        () => browser.eval('typeof __NEXT_DATA__.dynamicIds'),
        /undefined/
      )
    })
  })

  it('should hydrate suspenses on client side if suspended on server', async () => {
    await withBrowser('/suspense/thrown', async (browser) => {
      await check(() => browser.waitForElementByCss('#hydrated').text(), /true/)
      await check(
        () => browser.eval('typeof __NEXT_DATA__.dynamicIds'),
        /undefined/
      )
    })
  })

  it('should drain the entire response', async () => {
    await withBrowser('/suspense/backpressure', async (browser) => {
      await check(
        () => browser.eval('document.querySelectorAll(".item").length'),
        /2000/
      )
    })
  })
}
