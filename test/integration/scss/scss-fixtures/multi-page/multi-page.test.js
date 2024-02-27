/* eslint-env jest */

import cheerio from 'cheerio'
import { remove } from 'fs-extra'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
  File,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('SCSS Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('Has CSS in computed styles in Production', () => {
      const appDir = __dirname

      let appPort
      let app
      let stdout
      let code
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
        ;({ code, stdout } = await nextBuild(appDir, [], {
          stdout: true,
        }))
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      it('should have compiled successfully', () => {
        expect(code).toBe(0)
        expect(stdout).toMatch(/Compiled successfully/)
      })

      it('should have CSS for page', async () => {
        const browser = await webdriver(appPort, '/page2')

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('.blue-text')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
      })

      it(`should've preloaded the CSS file and injected it in <head>`, async () => {
        const content = await renderViaHTTP(appPort, '/page2')
        const $ = cheerio.load(content)

        const cssPreload = $('link[rel="preload"][as="style"]')
        expect(cssPreload.length).toBe(1)
        expect(cssPreload.attr('href')).toMatch(
          /^\/_next\/static\/css\/.*\.css$/
        )

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)
        expect(cssSheet.attr('href')).toMatch(/^\/_next\/static\/css\/.*\.css$/)

        /* ensure CSS preloaded first */
        const allPreloads = [].slice.call($('link[rel="preload"]'))
        const styleIndexes = allPreloads.flatMap((p, i) =>
          p.attribs.as === 'style' ? i : []
        )
        expect(styleIndexes).toEqual([0])
      })
    })
  })

  describe('development mode', () => {
    describe('Can hot reload CSS without losing state', () => {
      const appDir = __dirname

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })

      let appPort
      let app
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      it('should update CSS color without remounting <input>', async () => {
        let browser
        try {
          browser = await webdriver(appPort, '/page1')

          const desiredText = 'hello world'
          await browser.elementById('text-input').type(desiredText)
          expect(await browser.elementById('text-input').getValue()).toBe(
            desiredText
          )

          const currentColor = await browser.eval(
            `window.getComputedStyle(document.querySelector('.red-text')).color`
          )
          expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

          const cssFile = new File(join(appDir, 'styles/global1.scss'))
          try {
            cssFile.replace('$var: red', '$var: purple')
            await waitFor(2000) // wait for HMR

            const refreshedColor = await browser.eval(
              `window.getComputedStyle(document.querySelector('.red-text')).color`
            )
            expect(refreshedColor).toMatchInlineSnapshot(`"rgb(128, 0, 128)"`)

            // ensure text remained
            expect(await browser.elementById('text-input').getValue()).toBe(
              desiredText
            )
          } finally {
            cssFile.restore()
          }
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })
  })

  describe('Has CSS in computed styles in Development', () => {
    const appDir = __dirname

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    let appPort
    let app
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    it('should have CSS for page', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/page2')

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('.blue-text')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
})
