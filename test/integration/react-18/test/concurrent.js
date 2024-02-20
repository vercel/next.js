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

  it('flushes styled-jsx styles as the page renders', async () => {
    const html = await renderViaHTTP(
      context.appPort,
      '/use-flush-effect/styled-jsx'
    )
    const stylesOccurrence = html.match(/color:(\s)*(?:blue|#00f)/g) || []
    expect(stylesOccurrence.length).toBe(1)

    await withBrowser('/use-flush-effect/styled-jsx', async (browser) => {
      await check(
        () => browser.waitForElementByCss('#__jsx-900f996af369fc74').text(),
        /(?:blue|#00f)/
      )
      await check(
        () => browser.waitForElementByCss('#__jsx-8b0811664c4e575e').text(),
        /red/
      )
    })
  })
}
