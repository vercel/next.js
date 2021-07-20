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

  it('priority afterInteractive', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await waitFor(1000)

      async function test(id) {
        const script = await browser.elementById(id)
        const endScripts = await browser.elementsByCss(
          `#__NEXT_DATA__ ~ #${id}`
        )

        // Renders script tag
        expect(script).toBeDefined()
        // Script is inserted at the end
        expect(endScripts.length).toBe(1)
      }

      // afterInteractive script in page
      await test('scriptAfterInteractive')
      // afterInteractive script in _document
      await test('documentAfterInteractive')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('priority lazyOnload', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/page3')

      await browser.waitForElementByCss('#onload-div')
      await waitFor(1000)

      async function test(id) {
        const script = await browser.elementById(id)
        const endScripts = await browser.elementsByCss(
          `#__NEXT_DATA__ ~ #${id}`
        )

        // Renders script tag
        expect(script).toBeDefined()
        // Script is inserted at the end
        expect(endScripts.length).toBe(1)
      }

      // lazyOnload script in page
      await test('scriptLazyOnload')
      // lazyOnload script in _document
      await test('documentLazyOnload')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('priority beforeInteractive', async () => {
    const html = await renderViaHTTP(appPort, '/page1')
    const $ = cheerio.load(html)

    function test(id) {
      const script = $(`#${id}`)

      // Renders script tag
      expect(script.length).toBe(1)

      // Script is inserted before NextScripts
      expect(
        $(`#${id} ~ script[src^="/_next/static/chunks/main"]`).length
      ).toBeGreaterThan(0)
    }

    test('scriptBeforeInteractive')
    test('documentBeforeInteractive')
  })

  it('priority beforeInteractive on navigate', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')

      await browser.waitForElementByCss('[href="/page1"]')
      await browser.click('[href="/page1"]')

      await browser.waitForElementByCss('.container')
      await waitFor(1000)

      const script = await browser.elementById('scriptBeforeInteractive')

      // Renders script tag
      expect(script).toBeDefined()
    } finally {
      if (browser) await browser.close()
    }
  })

  it('onload fires correctly', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/page4')
      await waitFor(3000)

      const text = await browser.elementById('text').text()

      expect(text).toBe('aaabbbccc')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('Does not duplicate inline scripts', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')

      // Navigate away and back to page
      await browser.waitForElementByCss('[href="/page5"]')
      await browser.click('[href="/page5"]')
      await browser.waitForElementByCss('[href="/"]')
      await browser.click('[href="/"]')
      await browser.waitForElementByCss('[href="/page5"]')
      await browser.click('[href="/page5"]')

      await browser.waitForElementByCss('.container')
      await waitFor(1000)

      const text = await browser.elementById('text').text()

      expect(text).toBe('abc')
    } finally {
      if (browser) await browser.close()
    }
  })
})
