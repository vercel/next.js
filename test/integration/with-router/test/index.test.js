/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  getReactErrorOverlayContent,
  nextServer,
  launchApp,
  findPort,
  killApp,
  nextBuild,
  startApp,
  stopApp
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('withRouter', () => {
  const appDir = join(__dirname, '../')
  let appPort
  let server
  let app

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

describe('withRouter SSR', async () => {
  let server
  let port

  beforeAll(async () => {
    port = await findPort()
    server = await launchApp(join(__dirname, '..'), port)
  })
  afterAll(async () => {
    await killApp(server)
  })

  it('should show an error when trying to use router methods during SSR', async () => {
    const browser = await webdriver(port, '/router-method-ssr')
    expect(await getReactErrorOverlayContent(browser)).toMatch(`No router instance found. you should only use "next/router" inside the client side of your app. https://err.sh/`)
    browser.close()
  })
})
