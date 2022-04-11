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

let appDir = join(__dirname, '../base')
let appWithPartytownMissingDir = join(__dirname, '../partytown-missing')
let server
let appPort

async function bootApp(dir) {
  await nextBuild(dir)

  const app = nextServer({
    dir,
    dev: false,
    quiet: true,
  })

  server = await startApp(app)
  appPort = server.address().port
}

describe('Next.js Script - Primary Strategies', () => {
  beforeAll(async () => {
    await bootApp(appDir)
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
        const dataAttr = await script.getAttribute('data-nscript')
        const endScripts = await browser.elementsByCss(
          `#__NEXT_DATA__ ~ #${id}`
        )

        // Renders script tag
        expect(script).toBeDefined()
        expect(dataAttr).toBeDefined()

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

      const logs = await browser.log('browser')
      const filteredLogs = logs.filter(
        (log) =>
          !log.message.includes('Failed to load resource') &&
          !log.message === 'error' &&
          !log.message === 'Event'
      )
      expect(filteredLogs.length).toBe(0)

      async function test(id) {
        const script = await browser.elementById(id)
        const dataAttr = await script.getAttribute('data-nscript')
        const endScripts = await browser.elementsByCss(
          `#__NEXT_DATA__ ~ #${id}`
        )

        // Renders script tag
        expect(script).toBeDefined()
        expect(dataAttr).toBeDefined()

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
      expect(script.attr('data-nscript')).toBeDefined()

      // Script is inserted before NextScripts
      expect(
        $(`#${id} ~ script[src^="/_next/static/chunks/main"]`).length
      ).toBeGreaterThan(0)
    }

    test('scriptBeforeInteractive')
  })

  // Warning - Will be removed in the next major release
  it('priority beforeInteractive - older version', async () => {
    const html = await renderViaHTTP(appPort, '/page6')
    const $ = cheerio.load(html)

    function test(id) {
      const script = $(`#${id}`)

      // Renders script tag
      expect(script.length).toBe(1)
      expect(script.attr('data-nscript')).toBeDefined()

      // Script is inserted before NextScripts
      expect(
        $(`#${id} ~ script[src^="/_next/static/chunks/main"]`).length
      ).toBeGreaterThan(0)
    }

    test('scriptBeforePageRenderOld')
  })

  it('priority beforeInteractive on navigate', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')

      // beforeInteractive scripts should load once
      let documentBIScripts = await browser.elementsByCss(
        '[src$="scriptBeforeInteractive"]'
      )
      expect(documentBIScripts.length).toBe(1)

      await browser.waitForElementByCss('[href="/page1"]')
      await browser.click('[href="/page1"]')

      await browser.waitForElementByCss('.container')

      // Ensure beforeInteractive script isn't duplicated on navigation
      documentBIScripts = await browser.elementsByCss(
        '[src$="scriptBeforeInteractive"]'
      )
      expect(documentBIScripts.length).toBe(1)
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

  it('Error message is shown if Partytown is not installed locally', async () => {
    const { stdout, stderr } = await nextBuild(appWithPartytownMissingDir, [], {
      stdout: true,
      stderr: true,
    })
    const output = stdout + stderr

    expect(output.replace(/\n|\r/g, '')).toContain(
      `It looks like you're trying to use Partytown with next/script but do not have the required package(s) installed.Please install Partytown by running:	npm install @builder.io/partytownIf you are not trying to use Partytown, please disable the experimental "nextScriptWorkers" flag in next.config.js.`
    )
  })
})
