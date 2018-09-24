/* global jasmine, describe, it, expect, beforeAll, afterAll */

import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp
} from 'next-test-utils'
import webdriver from 'next-webdriver'

describe('withRouter', () => {
  const appDir = join(__dirname, '../')
  let appPort
  let server
  let app
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    appPort = server.address().port
  })

  afterAll(() => stopApp(server))

  it('allows observation of navigation events using withRouter', async () => {
    const browser = await webdriver(appPort, '/a')
    await browser.waitForElementByCss('#page-a')

    let activePage = await browser.elementByCss('.active').text()
    expect(activePage).toBe('Foo')

    await browser.elementByCss('button').click()
    await browser.waitForElementByCss('#page-b')

    activePage = await browser.elementByCss('.active').text()
    expect(activePage).toBe('Bar')

    browser.close()
  })

  it('allows observation of navigation events using top level Router', async () => {
    const browser = await webdriver(appPort, '/a')
    await browser.waitForElementByCss('#page-a')

    let activePage = await browser.elementByCss('.active-top-level-router').text()
    expect(activePage).toBe('Foo')

    await browser.elementByCss('button').click()
    await browser.waitForElementByCss('#page-b')

    activePage = await browser.elementByCss('.active-top-level-router').text()
    expect(activePage).toBe('Bar')

    browser.close()
  })

  it('allows observation of navigation events using top level Router deprecated behavior', async () => {
    const browser = await webdriver(appPort, '/a')
    await browser.waitForElementByCss('#page-a')

    let activePage = await browser.elementByCss('.active-top-level-router-deprecated-behavior').text()
    expect(activePage).toBe('Foo')

    await browser.elementByCss('button').click()
    await browser.waitForElementByCss('#page-b')

    activePage = await browser.elementByCss('.active-top-level-router-deprecated-behavior').text()
    expect(activePage).toBe('Bar')

    browser.close()
  })
})
