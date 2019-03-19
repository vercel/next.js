/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP,
  check,
  getBrowserBodyText,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import amphtmlValidator from 'amphtml-validator'
const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const context = {}

async function validateAMP (html) {
  const validator = await amphtmlValidator.getInstance()
  const result = validator.validateString(html)
  if (result.status !== 'PASS') {
    for (let ii = 0; ii < result.errors.length; ii++) {
      const error = result.errors[ii]
      let msg =
        'line ' + error.line + ', col ' + error.col + ': ' + error.message
      if (error.specUrl !== null) {
        msg += ' (see ' + error.specUrl + ')'
      }
      ;(error.severity === 'ERROR' ? console.error : console.warn)(msg)
    }
  }
  expect(result.status).toBe('PASS')
}

describe('AMP Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    context.appPort = appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  describe('With basic usage', () => {
    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)
    })
  })

  describe('With basic AMP usage', () => {
    it('should render the page as valid AMP', async () => {
      const html = await renderViaHTTP(appPort, '/?amp=1')
      await validateAMP(html)
      expect(html).toMatch(/Hello World/)

      const $ = cheerio.load(html)
      expect($('.abc').length === 1)
    })

    it('should add link preload for amp script', async () => {
      const html = await renderViaHTTP(appPort, '/?amp=1')
      await validateAMP(html)
      const $ = cheerio.load(html)
      expect(
        $(
          $('link[rel=preload]')
            .toArray()
            .find(i => $(i).attr('href') === 'https://cdn.ampproject.org/v0.js')
        ).attr('href')
      ).toBe('https://cdn.ampproject.org/v0.js')
    })

    it('should add custom styles before amp boilerplate styles', async () => {
      const html = await renderViaHTTP(appPort, '/?amp=1')
      await validateAMP(html)
      const $ = cheerio.load(html)
      const order = []
      $('style')
        .toArray()
        .forEach(i => {
          if ($(i).attr('amp-custom') === '') {
            order.push('amp-custom')
          }
          if ($(i).attr('amp-boilerplate') === '') {
            order.push('amp-boilerplate')
          }
        })

      expect(order).toEqual([
        'amp-custom',
        'amp-boilerplate',
        'amp-boilerplate'
      ])
    })
  })

  describe('With AMP context', () => {
    it('should render the normal page that uses the AMP hook', async () => {
      const html = await renderViaHTTP(appPort, '/use-amp-hook')
      expect(html).toMatch(/Hello others/)
    })

    it('should render the AMP page that uses the AMP hook', async () => {
      const html = await renderViaHTTP(appPort, '/use-amp-hook?amp=1')
      await validateAMP(html)
      expect(html).toMatch(/Hello AMP/)
    })

    it('should render nested normal page with AMP hook', async () => {
      const html = await renderViaHTTP(appPort, '/nested')
      expect(html).toMatch(/Hello others/)
    })

    it('should render nested AMP page with AMP hook', async () => {
      const html = await renderViaHTTP(appPort, '/nested?amp=1')
      await validateAMP(html)
      expect(html).toMatch(/Hello AMP/)
    })
  })

  describe('canonical amphtml', () => {
    it('should render link rel amphtml', async () => {
      const html = await renderViaHTTP(appPort, '/use-amp-hook')
      const $ = cheerio.load(html)
      expect(
        $('link[rel=amphtml]')
          .first()
          .attr('href')
      ).toBe('/use-amp-hook?amp=1')
    })

    it('should render the AMP page that uses the AMP hook', async () => {
      const html = await renderViaHTTP(appPort, '/use-amp-hook?amp=1')
      const $ = cheerio.load(html)
      await validateAMP(html)
      expect(
        $('link[rel=canonical]')
          .first()
          .attr('href')
      ).toBe('/use-amp-hook')
    })

    it('should remove conflicting amp tags', async () => {
      const html = await renderViaHTTP(appPort, '/conflicting-tag?amp=1')
      const $ = cheerio.load(html)
      await validateAMP(html)
      expect(
        $('meta[name=viewport]').attr('content')
      ).not.toBe('something :p')
    })
  })

  describe('combined styles', () => {
    it('should combine style tags', async () => {
      const html = await renderViaHTTP(appPort, '/styled?amp=1')
      const $ = cheerio.load(html)
      expect(
        $('style[amp-custom]')
          .first()
          .text()
      ).toMatch(
        /div.jsx-\d+{color:red;}span.jsx-\d+{color:blue;}body{background-color:green;}/
      )
    })

    it('should remove sourceMaps from styles', async () => {
      const html = await renderViaHTTP(appPort, '/styled?amp=1')
      const $ = cheerio.load(html)
      const styles = $('style[amp-custom]').first().text()

      expect(styles).not.toMatch(/\/\*@ sourceURL=.*?\*\//)
      expect(styles).not.toMatch(/\/\*# sourceMappingURL=.*\*\//)
    })
  })

  describe('editing a page', () => {
    let dynamicAppPort
    let ampDynamic
    beforeAll(async () => {
      dynamicAppPort = await findPort()
      ampDynamic = await launchApp(join(__dirname, '../'), dynamicAppPort)
    })
    afterAll(() => killApp(ampDynamic))
    it('should detect the changes and display it', async () => {
      let browser
      try {
        browser = await webdriver(dynamicAppPort, '/hmr/test')
        const text = await browser.elementByCss('p').text()
        expect(text).toBe('This is the hot AMP page.')

        const hmrTestPagePath = join(
          __dirname,
          '../',
          'pages',
          'hmr',
          'test.js'
        )

        const originalContent = readFileSync(hmrTestPagePath, 'utf8')
        const editedContent = originalContent.replace(
          'This is the hot AMP page',
          'This is a cold AMP page'
        )

        // change the content
        writeFileSync(hmrTestPagePath, editedContent, 'utf8')

        await check(
          () => getBrowserBodyText(browser),
          /This is a cold AMP page/
        )

        // add the original content
        writeFileSync(hmrTestPagePath, originalContent, 'utf8')

        await check(
          () => getBrowserBodyText(browser),
          /This is the hot AMP page/
        )
      } finally {
        if (browser) {
          browser.close()
        }
      }
    })
  })
})
