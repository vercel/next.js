/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { findPort, launchApp, killApp } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
let appPort
let app

describe('Basic Features', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should polyfill Node.js modules', async () => {
    const browser = await webdriver(appPort, '/node-browser-polyfills')

    await browser.waitForCondition('window.didRender')

    const data = await browser
      .waitForElementByCss('#node-browser-polyfills')
      .text()
    const parsedData = JSON.parse(data)

    expect(parsedData.vm).toBe(105)
    expect(parsedData.hash).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
    expect(parsedData.buffer).toBe('hello world')
    expect(parsedData.stream).toBe(true)
    expect(parsedData.assert).toBe(true)
    expect(parsedData.constants).toBe(7)
    expect(parsedData.domain).toBe(true)
    expect(parsedData.http).toBe(true)
    expect(parsedData.https).toBe(true)
    expect(parsedData.os).toBe('\n')
    expect(parsedData.path).toBe('/hello/world/test.txt')
    expect(parsedData.process).toBe('browser')
    expect(parsedData.querystring).toBe('a=b')
    expect(parsedData.stringDecoder).toBe(true)
    expect(parsedData.sys).toBe(true)
    expect(parsedData.timers).toBe(true)
  })
})
