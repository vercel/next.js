/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  nextServer,
  startApp,
  stopApp,
  nextBuild,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'

jest.setTimeout(1000 * 60 * 5)

let appDir = join(__dirname, '..')
let server
let appPort

describe('Script Loader', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    const app = nextServer({
      dir: appDir,
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    appPort = server.address().port
  })
  afterAll(() => {
    stopApp(server)
  })

  it('priority default', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      const preloads = await browser.elementsByCss('link[rel=preload]')
      const preloadEndHref = await preloads[preloads.length - 1].getAttribute(
        'href'
      )

      await waitFor(1000)

      const script = await browser.elementById('script')
      const src = await script.getAttribute('src')
      const scripts = await browser.elementsByCss('script')
      const scriptEnd = await scripts[scripts.length - 1].getAttribute('id')

      // Renders script tag
      expect(script).toBeDefined()
      // Renders preload
      expect(preloadEndHref).toBe(src)
      // Script is inserted at the end
      expect(scriptEnd).toBe('script')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('priority beforeHydrate', async () => {
    const html = await renderViaHTTP(appPort, '/page1')
    const $ = cheerio.load(html)

    const preloads = $('link[rel=preload]').toArray()

    // Preload is inserted at the beginning
    expect(preloads[0].attribs.href).toMatch(/beforeHydrate/)
    // Script is inserted before NextScripts
    expect(
      $('#__NEXT_DATA__ ~ #script ~ script[src^="/_next/static/chunks/main"]')
        .length
    ).toBeGreaterThan(0)
  })

  it('priority renderBlocking', async () => {
    const html = await renderViaHTTP(appPort, '/page2')
    const $ = cheerio.load(html)

    // Script is inserted in place
    expect($('.container #script').length).toBeGreaterThan(0)
  })
})
