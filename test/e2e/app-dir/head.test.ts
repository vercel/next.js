import path from 'path'
import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

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
          react: 'experimental',
          'react-dom': 'experimental',
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
  }

  runTests()
})
