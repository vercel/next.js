/* eslint-env jest */

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'
import webdriver from 'next-webdriver'

// test suits
import hmr from './hmr'
import errorRecovery from './error-recovery'
import dynamic from './dynamic'
import processEnv from './process-env'
import publicFolder from './public-folder'
import security from './security'

const context = {}
jest.setTimeout(1000 * 60 * 5)

describe('Basic Features', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    })

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/process-env'),

      renderViaHTTP(context.appPort, '/hmr/about'),
      renderViaHTTP(context.appPort, '/hmr/style'),
      renderViaHTTP(context.appPort, '/hmr/contact'),
      renderViaHTTP(context.appPort, '/hmr/counter'),
    ])
  })
  afterAll(() => killApp(context.server))

  it('should polyfill Node.js modules', async () => {
    const browser = await webdriver(context.appPort, '/node-browser-polyfills')
    await browser.waitForCondition('window.didRender')

    const data = await browser
      .waitForElementByCss('#node-browser-polyfills')
      .text()
    const parsedData = JSON.parse(data)

    expect(parsedData.vm).toBe(105)
    expect(parsedData.hash).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
    expect(parsedData.path).toBe('/hello/world/test.txt')
    expect(parsedData.buffer).toBe('hello world')
    expect(parsedData.stream).toBe(true)
  })

  dynamic(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  hmr(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  errorRecovery(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  processEnv(context)
  publicFolder(context)
  security(context)
})
