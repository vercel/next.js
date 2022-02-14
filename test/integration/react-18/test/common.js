/* eslint-env jest */

import webdriver from 'next-webdriver'
import {
  check,
  renderViaHTTP,
  hasRedbox,
  getRedboxSource,
} from 'next-test-utils'

export default (context) => {
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

  it('throws if useFlushEffects is called more than once', async () => {
    await renderViaHTTP(context.appPort, '/use-flush-effect/multiple-calls')
    expect(context.stderr).toContain(
      'Error: The `useFlushEffects` hook cannot be called more than once.'
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
