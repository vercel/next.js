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
let partytownSsrDir = join(__dirname, '../partytown-ssr')
let partytownCsrDir = join(__dirname, '../partytown-csr')
let partytownWithConfig = join(__dirname, '../partytown-with-config')
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

describe('Next Script', () => {
  describe('Primary Strategies', () => {
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
      test('documentBeforeInteractive')
    })

    it('priority beforeInteractive on navigate', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')

        // beforeInteractive scripts should load once
        let documentBIScripts = await browser.elementsByCss(
          '[src$="documentBeforeInteractive"]'
        )
        expect(documentBIScripts.length).toBe(1)

        await browser.waitForElementByCss('[href="/page1"]')
        await browser.click('[href="/page1"]')

        await browser.waitForElementByCss('.container')

        const script = await browser.elementById('scriptBeforeInteractive')

        // Ensure beforeInteractive script isn't duplicated on navigation
        documentBIScripts = await browser.elementsByCss(
          '[src$="documentBeforeInteractive"]'
        )
        expect(documentBIScripts.length).toBe(1)

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

  describe('Worker Strategy', () => {
    const partytownSnippet =
      require('next/dist/compiled/@builder.io/partytown/index.cjs').partytownSnippet()

    it('Partytown snippet is not injected to head if worker strategy is not used for a Script', async () => {
      let browser

      await bootApp(appDir)

      try {
        browser = await webdriver(appPort, '/')

        const script = await browser.eval(
          `document.querySelector('script[data-partytown]')`
        )

        expect(script).toEqual(null)
      } finally {
        if (browser) await browser.close()
        stopApp(server)
      }
    })

    it('Partytown snippet is injected to head via SSR if worker strategy is used for a Script', async () => {
      let browser

      await bootApp(partytownSsrDir)

      try {
        browser = await webdriver(appPort, '/')

        const script = await browser.eval(
          `document.querySelector('script[data-partytown]').innerHTML`
        )

        expect(script).not.toEqual(null)
        expect(script).toEqual(partytownSnippet)
      } finally {
        if (browser) await browser.close()
        stopApp(server)
      }
    })

    it('Partytown snippet is injected to head after a client-side transition if worker strategy is used for a Script', async () => {
      let browser

      await bootApp(partytownCsrDir)

      try {
        browser = await webdriver(appPort, '/')

        let script = await browser.eval(
          `document.querySelector('script[data-partytown]')`
        )

        expect(script).toEqual(null)

        await browser.waitForElementByCss('[href="/page1"]')
        await browser.click('[href="/page1"]')

        script = await browser.eval(
          `document.querySelector('script[data-partytown]').innerHTML`
        )

        expect(script).not.toEqual(null)
        expect(script).toEqual(partytownSnippet)
      } finally {
        if (browser) await browser.close()
        stopApp(server)
      }
    })

    it('Worker scripts are modified by Partytown to execute on a worker thread', async () => {
      let browser

      await bootApp(partytownCsrDir)

      try {
        browser = await webdriver(appPort, '/')

        await browser.waitForElementByCss('[href="/page1"]')
        await browser.click('[href="/page1"]')

        const predefinedWorkerScripts = await browser.eval(
          `document.querySelectorAll('script[type="text/partytown"]').length`
        )

        expect(predefinedWorkerScripts).toEqual(2)

        await waitFor(1000)

        // Partytown modifes type to "text/partytown-x" after it has been executed in the web worker
        const processedWorkerScripts = await browser.eval(
          `document.querySelectorAll('script[type="text/partytown-x"]').length`
        )

        expect(processedWorkerScripts).toEqual(2)
      } finally {
        if (browser) await browser.close()
        stopApp(server)
      }
    })

    it('Partytown config is injected to head when included', async () => {
      let browser

      await bootApp(partytownWithConfig)

      try {
        browser = await webdriver(appPort, '/')

        let script = await browser.eval(
          `document.querySelector('script[data-partytown-config]').innerHTML`
        )

        expect(script).toEqual(
          'partytown = {"forward":["dataLayer.push","fbq"]};'
        )
      } finally {
        if (browser) await browser.close()
        stopApp(server)
      }
    })
  })
})
