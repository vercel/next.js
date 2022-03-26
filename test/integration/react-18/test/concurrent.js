/* eslint-env jest */

import webdriver from 'next-webdriver'
import { check, renderViaHTTP } from 'next-test-utils'

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

  it('should resolve suspense on server side if not suspended on server', async () => {
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

  it('should resolve suspense on server side if suspended on server', async () => {
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

  it('throws if useFlushEffects is used more than once', async () => {
    await renderViaHTTP(context.appPort, '/use-flush-effect/multiple-calls')
    expect(context.stderr).toContain(
      'Error: The `useFlushEffects` hook cannot be used more than once.'
    )
  })

  it('throws if useFlushEffects is called on the client', async () => {
    await withBrowser('/use-flush-effect/client', async (browser) => {
      await check(
        () => browser.waitForElementByCss('#error').text(),
        /useFlushEffects can not be called on the client/
      )
    })
  })

  it('flushes styles as the page renders', async () => {
    await withBrowser('/use-flush-effect/styled-jsx', async (browser) => {
      await check(
        () => browser.waitForElementByCss('#__jsx-900f996af369fc74').text(),
        /blue/
      )
      await check(
        () => browser.waitForElementByCss('#__jsx-c74678abd3b78a').text(),
        /red/
      )
    })
  })

  it('flushes custom effects', async () => {
    await withBrowser('/use-flush-effect/custom', async (browser) => {
      await check(
        () => browser.waitForElementByCss('#custom-flush-effect-1').text(),
        /foo/
      )
      await check(
        () => browser.waitForElementByCss('#custom-flush-effect-2').text(),
        /bar/
      )
    })
  })
}
