/* eslint-env jest */

import { validateAMP } from 'amp-test-utils'
import cheerio from 'cheerio'
import { readFileSync, writeFileSync } from 'fs-extra'
import {
  check,
  findPort,
  getBrowserBodyText,
  killApp,
  launchApp,
  nextBuild,
  nextServer,
  renderViaHTTP,
  startApp,
  stopApp,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let server
let app
jest.setTimeout(1000 * 60 * 5)

const context = {}

describe('AMP Usage', () => {
  describe('production mode', () => {
    let output = ''

    beforeAll(async () => {
      const result = await nextBuild(appDir, undefined, {
        stdout: true,
        stderr: true,
      })
      output = result.stdout + result.stderr

      app = nextServer({
        dir: join(__dirname, '../'),
        dev: false,
        quiet: true,
      })

      server = await startApp(app)
      context.appPort = appPort = server.address().port
    })
    afterAll(() => stopApp(server))

    it('should not contain missing files warning', async () => {
      expect(output).toContain('Compiled successfully')
      expect(output).not.toContain('Could not find files for')
    })

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
        expect($('.abc')).toHaveLength(1)
      })

      it('should render the page without leaving render target', async () => {
        const html = await renderViaHTTP(appPort, '/special-chars')
        await validateAMP(html)
        expect(html).not.toContain('__NEXT_AMP_RENDER_TARGET__')
      })

      it('should not output client pages for AMP only', async () => {
        const browser = await webdriver(appPort, '/nav')
        await browser.elementByCss('#only-amp-link').click()

        const result = await browser.eval('window.NAV_PAGE_LOADED')

        expect(result).toBe(null)
      })

      it('should not output client pages for AMP only with config exported after declaration', async () => {
        const browser = await webdriver(appPort, '/nav')
        await browser.elementByCss('#var-before-export-link').click()

        const result = await browser.eval('window.NAV_PAGE_LOADED')

        expect(result).toBe(null)
      })

      it('should add link preload for amp script', async () => {
        const html = await renderViaHTTP(appPort, '/?amp=1')
        await validateAMP(html)
        const $ = cheerio.load(html)
        expect(
          $(
            $('link[rel=preload]')
              .toArray()
              .find(
                (i) => $(i).attr('href') === 'https://cdn.ampproject.org/v0.js'
              )
          ).attr('href')
        ).toBe('https://cdn.ampproject.org/v0.js')
      })

      it('should drop custom scripts', async () => {
        const html = await renderViaHTTP(appPort, '/custom-scripts')
        expect(html).not.toMatch(/src='\/im-not-allowed\.js'/)
        expect(html).not.toMatch(/console\.log("I'm not either :p")'/)
      })

      it('should not drop custom amp scripts', async () => {
        const html = await renderViaHTTP(appPort, '/amp-script?amp=1')
        await validateAMP(html)
      })

      it('should optimize clean', async () => {
        const html = await renderViaHTTP(appPort, '/only-amp')
        await validateAMP(html)
      })

      it('should auto import extensions', async () => {
        const html = await renderViaHTTP(appPort, '/auto-import')
        await validateAMP(html)
      })
    })

    describe('With AMP context', () => {
      it('should render the normal page that uses the AMP hook', async () => {
        const html = await renderViaHTTP(appPort, '/use-amp-hook')
        expect(html).toMatch(/Hello others/)
        expect(html).toMatch(/no AMP for you\.\.\./)
      })

      it('should render the AMP page that uses the AMP hook', async () => {
        const html = await renderViaHTTP(appPort, '/use-amp-hook?amp=1')
        await validateAMP(html)
        expect(html).toMatch(/Hello AMP/)
        expect(html).toMatch(/AMP Power!!!/)
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
        expect($('link[rel=amphtml]').first().attr('href')).toBe(
          'http://localhost:1234/use-amp-hook.amp'
        )
      })

      it('should render amphtml from provided rel link', async () => {
        const html = await renderViaHTTP(appPort, '/use-amp-hook.amp')
        await validateAMP(html)
      })

      it('should render link rel amphtml with existing query', async () => {
        const html = await renderViaHTTP(appPort, '/use-amp-hook?hello=1')
        expect(html).not.toMatch(/&amp;amp=1/)
      })

      it('should render the AMP page that uses the AMP hook', async () => {
        const html = await renderViaHTTP(appPort, '/use-amp-hook?amp=1')
        const $ = cheerio.load(html)
        await validateAMP(html)
        expect($('link[rel=canonical]').first().attr('href')).toBe(
          'http://localhost:1234/use-amp-hook'
        )
      })

      it('should render a canonical regardless of amp-only status (explicit)', async () => {
        const html = await renderViaHTTP(appPort, '/only-amp')
        const $ = cheerio.load(html)
        await validateAMP(html)
        expect($('link[rel=canonical]').first().attr('href')).toBe(
          'http://localhost:1234/only-amp'
        )
      })

      it('should not render amphtml link tag with no AMP page', async () => {
        const html = await renderViaHTTP(appPort, '/normal')
        const $ = cheerio.load(html)
        expect($('link[rel=amphtml]').first().attr('href')).not.toBeTruthy()
      })

      it('should remove conflicting amp tags', async () => {
        const html = await renderViaHTTP(appPort, '/conflicting-tag?amp=1')
        const $ = cheerio.load(html)
        await validateAMP(html)
        expect($('meta[name=viewport]').attr('content')).not.toBe(
          'something :p'
        )
      })

      it('should allow manually setting canonical', async () => {
        const html = await renderViaHTTP(appPort, '/manual-rels?amp=1')
        const $ = cheerio.load(html)
        await validateAMP(html)
        expect($('link[rel=canonical]').attr('href')).toBe(
          '/my-custom-canonical'
        )
      })

      it('should allow manually setting amphtml rel', async () => {
        const html = await renderViaHTTP(appPort, '/manual-rels')
        const $ = cheerio.load(html)
        expect($('link[rel=amphtml]').attr('href')).toBe('/my-custom-amphtml')
        expect($('link[rel=amphtml]')).toHaveLength(1)
      })
    })

    describe('combined styles', () => {
      it('should combine style tags', async () => {
        const html = await renderViaHTTP(appPort, '/styled?amp=1')
        const $ = cheerio.load(html)
        expect($('style[amp-custom]').first().text()).toMatch(
          /div.jsx-\d+{color:red}span.jsx-\d+{color:#00f}body{background-color:green}/
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
  })

  describe('AMP dev no-warn', () => {
    let dynamicAppPort
    let ampDynamic

    it('should not warn on valid amp', async () => {
      let inspectPayload = ''
      dynamicAppPort = await findPort()
      ampDynamic = await launchApp(join(__dirname, '../'), dynamicAppPort, {
        onStdout(msg) {
          inspectPayload += msg
        },
      })

      await renderViaHTTP(dynamicAppPort, '/only-amp')

      await killApp(ampDynamic)

      expect(inspectPayload).not.toContain('warn')
    })
  })

  describe('AMP dev mode', () => {
    let dynamicAppPort
    let ampDynamic
    let output = ''

    beforeAll(async () => {
      dynamicAppPort = await findPort()
      ampDynamic = await launchApp(join(__dirname, '../'), dynamicAppPort, {
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })
    })

    afterAll(() => killApp(ampDynamic))

    it('should navigate from non-AMP to AMP without error', async () => {
      const browser = await webdriver(dynamicAppPort, '/normal')
      await browser.elementByCss('#to-amp').click()
      await browser.waitForElementByCss('#only-amp')
      expect(await browser.elementByCss('#only-amp').text()).toMatch(/Only AMP/)
    })

    it('should add data-ampdevmode to development script tags', async () => {
      const html = await renderViaHTTP(dynamicAppPort, '/only-amp')
      const $ = cheerio.load(html)
      expect($('html').attr('data-ampdevmode')).toBe('')
      expect(
        [].slice
          .apply($('script[data-ampdevmode]'))
          .map((el) => el.attribs.src || el.attribs.id)
          .map((e) =>
            e.startsWith('/') ? new URL(e, 'http://x.x').pathname : e
          )
      ).toEqual([
        '__NEXT_DATA__',
        '/_next/static/chunks/react-refresh.js',
        '/_next/static/chunks/polyfills.js',
        '/_next/static/chunks/webpack.js',
        '/_next/static/chunks/amp.js',
      ])
    })

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
        await browser.close()
      }
    })

    it('should detect changes and refresh an AMP page', async () => {
      let browser
      try {
        browser = await webdriver(dynamicAppPort, '/hmr/amp')
        const text = await browser.elementByCss('p').text()
        expect(text).toBe(`I'm an AMP page!`)

        const hmrTestPagePath = join(__dirname, '../', 'pages', 'hmr', 'amp.js')

        const originalContent = readFileSync(hmrTestPagePath, 'utf8')
        const editedContent = originalContent.replace(
          `I'm an AMP page!`,
          'replaced it!'
        )

        // change the content
        writeFileSync(hmrTestPagePath, editedContent, 'utf8')

        await check(() => getBrowserBodyText(browser), /replaced it!/)

        // add the original content
        writeFileSync(hmrTestPagePath, originalContent, 'utf8')

        await check(() => getBrowserBodyText(browser), /I'm an AMP page!/)
      } finally {
        await browser.close()
      }
    })

    it('should detect changes to component and refresh an AMP page', async () => {
      const browser = await webdriver(dynamicAppPort, '/hmr/comp')
      await check(() => browser.elementByCss('#hello-comp').text(), /hello/)

      const testComp = join(__dirname, '../components/hello.js')

      const origContent = readFileSync(testComp, 'utf8')
      const newContent = origContent.replace('>hello<', '>hi<')

      writeFileSync(testComp, newContent, 'utf8')
      await check(() => browser.elementByCss('#hello-comp').text(), /hi/)

      writeFileSync(testComp, origContent, 'utf8')
      await check(() => browser.elementByCss('#hello-comp').text(), /hello/)
    })

    it('should not reload unless the page is edited for an AMP page', async () => {
      let browser
      const hmrTestPagePath = join(__dirname, '../', 'pages', 'hmr', 'test.js')
      const originalContent = readFileSync(hmrTestPagePath, 'utf8')
      try {
        await renderViaHTTP(dynamicAppPort, '/hmr/test')

        browser = await webdriver(dynamicAppPort, '/hmr/amp')
        await check(() => browser.elementByCss('p').text(), /I'm an AMP page!/)

        const origDate = await browser.elementByCss('span').text()

        const editedContent = originalContent.replace(
          `This is the hot AMP page.`,
          'replaced it!'
        )

        // change the content
        writeFileSync(hmrTestPagePath, editedContent, 'utf8')

        let checks = 5
        let i = 0
        while (i < checks) {
          const curText = await browser.elementByCss('span').text()
          expect(curText).toBe(origDate)
          await waitFor(1000)
          i++
        }

        // add the original content
        writeFileSync(hmrTestPagePath, originalContent, 'utf8')

        const otherHmrTestPage = join(__dirname, '../pages/hmr/amp.js')

        const otherOrigContent = readFileSync(otherHmrTestPage, 'utf8')
        const otherEditedContent = otherOrigContent.replace(
          `I'm an AMP page!`,
          `replaced it!`
        )

        // change the content
        writeFileSync(otherHmrTestPage, otherEditedContent, 'utf8')

        await check(() => getBrowserBodyText(browser), /replaced it!/)

        // restore original content
        writeFileSync(otherHmrTestPage, otherOrigContent, 'utf8')

        await check(() => getBrowserBodyText(browser), /I'm an AMP page!/)
      } finally {
        writeFileSync(hmrTestPagePath, originalContent, 'utf8')
        await browser.close()
      }
    })

    it('should detect changes and refresh a hybrid AMP page', async () => {
      let browser
      try {
        browser = await webdriver(dynamicAppPort, '/hmr/hybrid?amp=1')
        const text = await browser.elementByCss('p').text()
        expect(text).toBe(`I'm a hybrid AMP page!`)

        const hmrTestPagePath = join(
          __dirname,
          '../',
          'pages',
          'hmr',
          'hybrid.js'
        )

        const originalContent = readFileSync(hmrTestPagePath, 'utf8')
        const editedContent = originalContent.replace(
          `I'm a hybrid AMP page!`,
          'replaced it!'
        )

        // change the content
        writeFileSync(hmrTestPagePath, editedContent, 'utf8')

        await check(() => getBrowserBodyText(browser), /replaced it!/)

        // add the original content
        writeFileSync(hmrTestPagePath, originalContent, 'utf8')

        await check(() => getBrowserBodyText(browser), /I'm a hybrid AMP page!/)
      } finally {
        await browser.close()
      }
    })

    it('should detect changes and refresh an AMP page at root pages/', async () => {
      let browser
      try {
        browser = await webdriver(dynamicAppPort, '/root-hmr')
        const text = await browser.elementByCss('p').text()
        expect(text).toBe(`I'm an AMP page!`)

        const hmrTestPagePath = join(__dirname, '../', 'pages', 'root-hmr.js')

        const originalContent = readFileSync(hmrTestPagePath, 'utf8')
        const editedContent = originalContent.replace(
          `I'm an AMP page!`,
          'replaced it!'
        )

        // change the content
        writeFileSync(hmrTestPagePath, editedContent, 'utf8')

        await check(() => getBrowserBodyText(browser), /replaced it!/)

        // add the original content
        writeFileSync(hmrTestPagePath, originalContent, 'utf8')

        await check(() => getBrowserBodyText(browser), /I'm an AMP page!/)
      } finally {
        await browser.close()
      }
    })

    it('should not contain missing files warning', async () => {
      expect(output).toContain('compiled successfully')
      expect(output).toContain('build page: /only-amp')
      expect(output).not.toContain('Could not find files for')
    })
  })
})
