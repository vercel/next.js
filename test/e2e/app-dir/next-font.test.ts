import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'
import path from 'path'
import webdriver from 'next-webdriver'

describe('app dir next-font', () => {
  if ((global as any).isNextDeploy || (global as any).isNextDev) {
    it('should skip next deploy for now', () => {})
    return
  }

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'next-font')),
      dependencies: {
        '@next/font': 'canary',
        react: 'experimental',
        'react-dom': 'experimental',
      },
      skipStart: true,
    })
    await next.start()
  })
  afterAll(() => next.destroy())

  describe('import values', () => {
    it('should have correct values at /', async () => {
      const html = await renderViaHTTP(next.url, '/')
      const $ = cheerio.load(html)

      // layout
      expect(JSON.parse($('#root-layout').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        variable: expect.stringMatching(/^__variable_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(/^'__font1_.{6}'$/),
        },
      })
      // page
      expect(JSON.parse($('#root-page').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        variable: expect.stringMatching(/^__variable_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(/^'__font2_.{6}'$/),
        },
      })
      // Comp
      expect(JSON.parse($('#root-comp').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(/^'__font3_.{6}'$/),
          fontStyle: 'italic',
          fontWeight: 900,
        },
      })
    })

    it('should have correct values at /client', async () => {
      const html = await renderViaHTTP(next.url, '/client')
      const $ = cheerio.load(html)

      // root layout
      expect(JSON.parse($('#root-layout').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        variable: expect.stringMatching(/^__variable_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(/^'__font1_.{6}'$/),
        },
      })

      // layout
      expect(JSON.parse($('#client-layout').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(/^'__font4_.{6}'$/),
          fontWeight: 100,
        },
      })
      // page
      expect(JSON.parse($('#client-page').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(/^'__font5_.{6}'$/),
          fontStyle: 'italic',
        },
      })
      // Comp
      expect(JSON.parse($('#client-comp').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(/^'__font6_.{6}'$/),
        },
      })
    })
  })

  describe('computed styles', () => {
    it('should have correct styles at /', async () => {
      const browser = await webdriver(next.url, '/')

      // layout
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-layout")).fontFamily'
        )
      ).toMatch(/^__font1_.{6}$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-layout")).fontWeight'
        )
      ).toBe('400')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-layout")).fontStyle'
        )
      ).toBe('normal')

      // page
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-page")).fontFamily'
        )
      ).toMatch(/^__font2_.{6}$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-page")).fontWeight'
        )
      ).toBe('400')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-page")).fontStyle'
        )
      ).toBe('normal')

      // Comp
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-comp")).fontFamily'
        )
      ).toMatch(/^__font3_.{6}$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-comp")).fontWeight'
        )
      ).toBe('900')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-comp")).fontStyle'
        )
      ).toBe('italic')
    })

    it('should have correct styles at /client', async () => {
      const browser = await webdriver(next.url, '/client')

      // root layout
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-layout")).fontFamily'
        )
      ).toMatch(/^__font1_.{6}$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-layout")).fontWeight'
        )
      ).toBe('400')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#root-layout")).fontStyle'
        )
      ).toBe('normal')

      // layout
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#client-layout")).fontFamily'
        )
      ).toMatch(/^__font4_.{6}$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#client-layout")).fontWeight'
        )
      ).toBe('100')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#client-layout")).fontStyle'
        )
      ).toBe('normal')

      // page
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#client-page")).fontFamily'
        )
      ).toMatch(/^__font5_.{6}$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#client-page")).fontWeight'
        )
      ).toBe('400')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#client-page")).fontStyle'
        )
      ).toBe('italic')

      // Comp
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#client-comp")).fontFamily'
        )
      ).toMatch(/^__font6_.{6}$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#client-comp")).fontWeight'
        )
      ).toBe('400')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#client-comp")).fontStyle'
        )
      ).toBe('normal')
    })
  })
})
