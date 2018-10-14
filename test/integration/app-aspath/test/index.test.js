/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  fsTimeMachine
} from 'next-test-utils'
import { asserters } from 'wd'

let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('App asPath', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(join(__dirname, '../'), appPort)

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(appPort, '/')
    ])
  })
  afterAll(() => killApp(server))

  it('should not have any changes in asPath after a bundle rebuild', async () => {
    const _appJS = await fsTimeMachine(join(__dirname, '../', 'pages', '_app.js'))
    const browser = await webdriver(appPort, '/')

    const text = await browser.elementByCss('body').text()
    expect(text).toBe('{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }')

    await _appJS.replace('find this', 'replace with this')
    await browser.waitFor(asserters.textInclude('{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }'), 30000)

    await Promise.all([
      _appJS.restore(),
      browser.quit()
    ])
  })
})
