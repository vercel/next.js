/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

// test suites

const context = {}
jest.setTimeout(1000 * 60 * 5)

describe('getServerSideProps redirects', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    })

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/alias-to-main-content'),
      renderViaHTTP(context.appPort, '/main-content'),
    ])
  })
  afterAll(() => killApp(context.server))

  it('should use a client-side navigation for a rewritten URL', async () => {
    const browser = await webdriver(context.appPort, '/alias-to-main-content')

    await browser.executeScript(function () {
      // During a browser navigation global variables are reset,
      // So by chaking that the __SAME_PAGE variable is still defined
      // then the client-side navigation has happened
      window.__SAME_PAGE = true
    })

    await browser.elementByCss('#link-with-rewritten-url').click()

    // Wait until the new props are rendered
    await browser.waitForElementByCss('.refreshed')

    expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
  })
})
