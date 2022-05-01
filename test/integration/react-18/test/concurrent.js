/* eslint-env jest */

import webdriver from 'next-webdriver'
import { check, renderViaHTTP } from 'next-test-utils'

export default (context, _render) => {
  async function withBrowser(path, cb) {
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
        () => browser.waitForElementByCss('#__jsx-8b0811664c4e575e').text(),
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
