/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  nextServer,
  startApp,
  stopApp,
  nextBuild,
  waitFor,
  findPort,
  launchApp,
  killApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'

let appDir = join(__dirname, '../base')
let appWithPartytownMissingDir = join(__dirname, '../partytown-missing')
let server
let appPort

const runTests = (isDev) => {
  // TODO: We will refactor the next/script to be strict mode resilient
  // Don't skip the test case for development mode (strict mode) once refactoring is finished
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

      const logs = await browser.log()
      const filteredLogs = logs.filter(
        (log) =>
          !log.message.includes('Failed to load resource') &&
          !log.message === 'error' &&
          !log.message === 'Event'
      )
      expect(filteredLogs.length).toBe(0)

      async function test(id, css) {
        const script = await browser.elementById(id)
        const dataAttr = await script.getAttribute('data-nscript')
        const endScripts = await browser.elementsByCss(
          `#__NEXT_DATA__ ~ #${id}`
        )

        // Renders script tag
        expect(script).toBeDefined()
        expect(dataAttr).toBeDefined()

        if (css) {
          const cssTag = await browser.elementByCss(`link[href="${css}"]`)
          expect(cssTag).toBeDefined()
        }

        // Script is inserted at the end
        expect(endScripts.length).toBe(1)
      }

      // lazyOnload script in page
      await test(
        'scriptLazyOnload',
        'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'
      )
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
      if (process.env.TURBOPACK) {
        // Turbopack generates different script names
        expect(
          $(
            `#${id} ~ script[src^="/_next/static/chunks/%5Broot%20of%20the%20server%5D__"]`
          ).length
        ).toBeGreaterThan(0)
      } else {
        expect(
          $(`#${id} ~ script[src^="/_next/static/chunks/main"]`).length
        ).toBeGreaterThan(0)
      }
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
      if (process.env.TURBOPACK) {
        // Turbopack generates different script names
        expect(
          $(
            `#${id} ~ script[src^="/_next/static/chunks/%5Broot%20of%20the%20server%5D__"]`
          ).length
        ).toBeGreaterThan(0)
      } else {
        expect(
          $(`#${id} ~ script[src^="/_next/static/chunks/main"]`).length
        ).toBeGreaterThan(0)
      }
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
      expect(documentBIScripts.length).toBe(2)

      await browser.waitForElementByCss('[href="/page1"]').click()

      await browser.waitForElementByCss('.container')

      // Ensure beforeInteractive script isn't duplicated on navigation
      documentBIScripts = await browser.elementsByCss(
        '[src$="scriptBeforeInteractive"]'
      )
      expect(documentBIScripts.length).toBe(2)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('onload fires correctly', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/page4')
      await waitFor(3000)

      const text = await browser.elementById('onload-div-1').text()
      expect(text).toBe('aaabbbccc')

      // Navigate to different page and back
      await browser.waitForElementByCss('[href="/page9"]').click()
      await browser.waitForElementByCss('[href="/page4"]').click()

      await browser.waitForElementByCss('#onload-div-1')
      const sameText = await browser.elementById('onload-div-1').text()
      // onload should only be fired once, not on sequential re-mount
      expect(sameText).toBe('')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('priority beforeInteractive with inline script', async () => {
    const html = await renderViaHTTP(appPort, '/page5')
    const $ = cheerio.load(html)

    const script = $('#inline-before')
    expect(script.length).toBe(1)

    // css bundle is only generated in production, so only perform inline script position check in production
    if (!isDev) {
      // Script is inserted before CSS
      expect(
        $(`#inline-before ~ link[href^="/_next/static/"]`).filter(
          (i, element) => $(element).attr('href')?.endsWith('.css')
        ).length
      ).toBeGreaterThan(0)
    }
  })

  it('priority beforeInteractive with inline script should execute', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/page7')
      await waitFor(1000)

      const logs = await browser.log()
      // not only should inline script run, but also should only run once
      expect(
        logs.filter((log) =>
          log.message.includes('beforeInteractive inline script run')
        ).length
      ).toBe(1)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('Does not duplicate inline scripts', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')

      // Navigate away and back to page
      await browser.waitForElementByCss('[href="/page5"]').click()
      await browser.waitForElementByCss('[href="/"]').click()
      await browser.waitForElementByCss('[href="/page5"]').click()

      await browser.waitForElementByCss('.container')
      await waitFor(1000)

      const text = await browser.elementById('text').text()

      expect(text).toBe('abc')
    } finally {
      if (browser) await browser.close()
    }
  })

  if (!isDev) {
    it('Error message is shown if Partytown is not installed locally', async () => {
      const { stdout, stderr } = await nextBuild(
        appWithPartytownMissingDir,
        [],
        {
          stdout: true,
          stderr: true,
        }
      )
      const output = stdout + stderr

      expect(output.replace(/[\n\r]/g, '')).toMatch(
        /It looks like you're trying to use Partytown with next\/script but do not have the required package\(s\) installed.Please install Partytown by running:.*?(npm|pnpm|yarn) (install|add) (--save-dev|--dev) @builder.io\/partytownIf you are not trying to use Partytown, please disable the experimental "nextScriptWorkers" flag in next.config.js./
      )
    })
  }

  it('onReady fires after load event and then on every subsequent re-mount', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/page8')

      const text = await browser.elementById('text').text()

      expect(text).toBe('aaa')

      // Navigate to different page and back
      await browser.waitForElementByCss('[href="/page9"]').click()
      await browser.waitForElementByCss('[href="/page8"]').click()

      await browser.waitForElementByCss('.container')
      const sameText = await browser.elementById('text').text()

      expect(sameText).toBe('aaa') // onReady should fire again
    } finally {
      if (browser) await browser.close()
    }
  })

  // https://github.com/vercel/next.js/issues/39993
  it('onReady should only fires once after loaded (issue #39993)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/page10')

      // wait for remote script to be loaded
      await waitFor(1000)
      expect(await browser.eval(`window.remoteScriptsOnReadyCalls`)).toBe(1)
      expect(await browser.eval(`window.inlineScriptsOnReadyCalls`)).toBe(1)
    } finally {
      if (browser) await browser.close()
    }
  })
}

describe('Next.js Script - Primary Strategies - Strict Mode', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(appDir, appPort)
  })

  afterAll(async () => {
    if (server) await killApp(server)
  })

  runTests(true)
})

describe('Next.js Script - Primary Strategies - Production Mode', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
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
      afterAll(async () => {
        await stopApp(server)
      })

      runTests(false)
    }
  )
})
