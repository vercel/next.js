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
      await waitFor(1000)

      const script = await browser.elementById('script')
      const src = await script.getAttribute('src')
      const scriptPreload = await browser.elementsByCss(
        `link[rel=preload][href="${src}"]`
      )
      const endScripts = await browser.elementsByCss(
        '#script ~ script[src^="/_next/static/"]'
      )
      const endPreloads = await browser.elementsByCss(
        `link[rel=preload][href="${src}"] ~ link[rel=preload][href^="/_next/static/"]`
      )

      // Renders script tag
      expect(script).toBeDefined()
      // Renders preload
      expect(scriptPreload).toBeDefined()
      // Script is inserted at the end
      expect(endScripts.length).toBe(0)
      //Preload is defined at the end
      expect(endPreloads.length).toBe(0)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('priority beforeHydrate', async () => {
    const html = await renderViaHTTP(appPort, '/page1')
    const $ = cheerio.load(html)

    const script = $('#script')
    const src = script.attr('src')

    // Renders script tag
    expect(script).toBeDefined()
    // Preload is inserted at the beginning
    expect(
      $(
        `link[rel=preload][href="${src}"] ~ link[rel=preload][href^="/_next/static/"]`
      ).length &&
        !$(
          `link[rel=preload][href^="/_next/static/chunks/main"] ~ link[rel=preload][href="${src}"]`
        ).length
    ).toBeTruthy()
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
