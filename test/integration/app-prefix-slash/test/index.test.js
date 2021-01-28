/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

let appPort
let server
jest.setTimeout(1000 * 60 * 5)

describe('App Prefix Slash', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(join(__dirname, '../'), appPort)

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(appPort, '/')])
  })
  afterAll(() => killApp(server))

  it('should add prefix slash', async () => {
    const browser = await webdriver(appPort, '/')
    const text = await browser.elementByCss('a').text()
    expect(text).toBe('Add prefix slash')
  })
})
