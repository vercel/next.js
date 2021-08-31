/* eslint-env jest */

import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

export default (context) => {
  async function renderAndCheck(path, cb) {
    let browser
    try {
      browser = await webdriver(context.appPort, path)
      await cb(browser)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  }

  it('should resolve suspense modules on server side if suspense', async () => {
    await renderAndCheck('/suspense/no-preload', async (browser) => {
      await check(
        () =>
          typeof JSON.parse(browser.elementByCss('#__NEXT_DATA__').text())
            .dynamicIds === 'undefined'
            ? 'true'
            : 'false',
        /true/
      )
      await check(() => browser.elementByCss('#__next').text(), /barfoo/)
    })
  })

  it('should resolve suspense on server side if not suspended on server', async () => {
    await renderAndCheck('/suspense/no-thrown', async (browser) => {
      await check(
        () =>
          typeof JSON.parse(browser.elementByCss('#__NEXT_DATA__').text())
            .dynamicIds === 'undefined'
            ? 'true'
            : 'false',
        /true/
      )
      await check(() => browser.elementByCss('body').text(), /hello/)
    })
  })

  it('should resolve suspense on server side if suspended on server', async () => {
    await renderAndCheck('/suspense/thrown', async (browser) => {
      await check(
        () =>
          typeof JSON.parse(browser.elementByCss('#__NEXT_DATA__').text())
            .dynamicIds === 'undefined'
            ? 'true'
            : 'false',
        /true/
      )
      await check(() => browser.elementByCss('body').text(), /hello/)
    })
  })

  it('should hydrate suspenses on client side if suspended on server', async () => {
    let browser
    try {
      browser = await webdriver(context.appPort, '/suspense/thrown')
      await check(() => browser.elementByCss('body').text(), /hello/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
}
