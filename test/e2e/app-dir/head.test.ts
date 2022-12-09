import fs from 'fs-extra'
import path from 'path'
import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import webdriver from 'next-webdriver'
import escapeStringRegexp from 'escape-string-regexp'

describe('app dir head', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }
  let next: NextInstance

  function runTests() {
    beforeAll(async () => {
      next = await createNext({
        files: new FileRef(path.join(__dirname, 'head')),
        dependencies: {
          react: 'latest',
          'react-dom': 'latest',
        },
        skipStart: true,
      })

      await next.start()
    })
    afterAll(() => next.destroy())

    it('should use head from index page', async () => {
      const html = await renderViaHTTP(next.url, '/')
      const $ = cheerio.load(html)
      const headTags = $('head').children().toArray()

      expect(headTags.find((el) => el.attribs.src === '/hello.js')).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/another.js')
      ).toBeTruthy()
    })

    it('should use correct head for /blog', async () => {
      const html = await renderViaHTTP(next.url, '/blog')
      const $ = cheerio.load(html)
      const headTags = $('head').children().toArray()

      expect(headTags.find((el) => el.attribs.src === '/hello3.js')).toBeFalsy()
      expect(
        headTags.find((el) => el.attribs.src === '/hello1.js')
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/hello2.js')
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/another.js')
      ).toBeTruthy()
    })

    it('should use head from layout when not on page', async () => {
      const html = await renderViaHTTP(next.url, '/blog/about')
      const $ = cheerio.load(html)
      const headTags = $('head').children().toArray()

      expect(
        headTags.find((el) => el.attribs.src === '/hello1.js')
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/hello2.js')
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/another.js')
      ).toBeTruthy()
    })

    it('should pass params to head for dynamic path', async () => {
      const html = await renderViaHTTP(next.url, '/blog/post-1')
      const $ = cheerio.load(html)
      const headTags = $('head').children().toArray()

      expect(
        headTags.find(
          (el) =>
            el.attribs.src === '/hello3.js' &&
            el.attribs['data-slug'] === 'post-1'
        )
      ).toBeTruthy()
      expect(
        headTags.find((el) => el.attribs.src === '/another.js')
      ).toBeTruthy()
    })

    it('should apply head when navigating client-side', async () => {
      const browser = await webdriver(next.url, '/')

      const getTitle = () => browser.elementByCss('title').text()

      expect(await getTitle()).toBe('hello from index')
      await browser
        .elementByCss('#to-blog')
        .click()
        .waitForElementByCss('#layout', 2000)

      expect(await getTitle()).toBe('hello from blog layout')
      await browser.back().waitForElementByCss('#to-blog', 2000)
      expect(await getTitle()).toBe('hello from index')
      await browser
        .elementByCss('#to-blog-slug')
        .click()
        .waitForElementByCss('#layout', 2000)
      expect(await getTitle()).toBe('hello from dynamic blog page post-1')
    })

    it('should treat next/head as client components but not apply', async () => {
      const errors = []
      next.on('stderr', (args) => {
        errors.push(args)
      })
      const html = await renderViaHTTP(next.url, '/next-head')
      expect(html).not.toMatch(/<title>legacy-head<\/title>/)

      if (globalThis.isNextDev) {
        expect(
          errors.some(
            (output) =>
              output ===
              `You're using \`next/head\` inside app directory, please migrate to \`head.js\`. Checkout https://beta.nextjs.org/docs/api-reference/file-conventions/head for details.\n`
          )
        ).toBe(true)

        const dynamicChunkPath = path.join(
          next.testDir,
          '.next',
          'static/chunks/_app-client_app_next-head_client-head_js.js'
        )
        const content = await fs.readFile(dynamicChunkPath, 'utf-8')
        expect(content).not.toMatch(
          new RegExp(escapeStringRegexp(`next/dist/shared/lib/head.js`), 'm')
        )
        expect(content).toMatch(
          new RegExp(
            escapeStringRegexp(`next/dist/client/components/noop-head.js`),
            'm'
          )
        )
      }
    })
  }

  runTests()
})
