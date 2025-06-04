/* eslint-env jest */

import cheerio from 'cheerio'
import { findPort, killApp, launchApp, renderViaHTTP } from 'next-test-utils'
import webdriver from 'next-webdriver'
import fetch from 'node-fetch'
import { join } from 'path'

const context = {}

describe('Configuration', () => {
  beforeAll(async () => {
    context.output = ''

    const handleOutput = (msg) => {
      context.output += msg
    }

    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort, {
      onStdout: handleOutput,
      onStderr: handleOutput,
    })

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/next-config'),
      renderViaHTTP(context.appPort, '/module-only-component'),
    ])
  })

  afterAll(async () => {
    await killApp(context.server)
  })

  async function get$(path, query) {
    const html = await renderViaHTTP(context.appPort, path, query)
    return cheerio.load(html)
  }

  it('should disable X-Powered-By header support', async () => {
    const url = `http://localhost:${context.appPort}/`
    const header = (await fetch(url)).headers.get('X-Powered-By')
    expect(header).not.toBe('Next.js')
  })

  test('renders server config on the server only', async () => {
    const $ = await get$('/next-config')
    expect($('#server-only').text()).toBe('secret')
  })

  test('renders public config on the server only', async () => {
    const $ = await get$('/next-config')
    expect($('#server-and-client').text()).toBe('/static')
  })

  test('correctly imports a package that defines `module` but no `main` in package.json', async () => {
    const $ = await get$('/module-only-content')
    expect($('#messageInAPackage').text()).toBe('OK')
  })

  it('should have config available on the client', async () => {
    const browser = await webdriver(context.appPort, '/next-config')

    const serverText = await browser.elementByCss('#server-only').text()
    const serverClientText = await browser
      .elementByCss('#server-and-client')
      .text()
    const envValue = await browser.elementByCss('#env').text()

    expect(serverText).toBe('')
    expect(serverClientText).toBe('/static')
    expect(envValue).toBe('hello')
    await browser.close()
  })
})
