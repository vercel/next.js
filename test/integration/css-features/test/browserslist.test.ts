/* eslint-env jest */

import { remove } from 'fs-extra'
import {
  nextBuild,
  fetchViaHTTP,
  renderViaHTTP,
  findPort,
  nextStart,
  killApp,
} from 'next-test-utils'
import { join } from 'path'
import cheerio from 'cheerio'

const fixturesDir = join(__dirname, '../fixtures')

describe('Browserslist: Old', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'browsers-old')

      let appPort
      let app
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
        const { code } = await nextBuild(appDir, [], {
          stdout: true,
        })
        if (code !== 0) {
          throw new Error('Build failed')
        }
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      it(`should've emitted a single CSS file`, async () => {
        const content = await renderViaHTTP(appPort, '/')
        const $ = cheerio.load(content)

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)

        const stylesheetUrl = cssSheet.attr('href')

        const cssContent = await fetchViaHTTP(appPort, stylesheetUrl).then(
          (res) => res.text()
        )

        const cssContentWithoutSourceMap = cssContent
          .replace(/\/\*.*?\*\/\n?/g, '')
          .trim()

        if (process.env.IS_TURBOPACK_TEST) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"a{all:initial}@media (-webkit-min-device-pixel-ratio:2),(min-resolution:2dppx){.image{background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}}"`
          )
        } else {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"a{-webkit-animation:none 0s ease 0s 1 normal none running;animation:none 0s ease 0s 1 normal none running;-webkit-backface-visibility:visible;backface-visibility:visible;background:transparent none repeat 0 0/auto auto padding-box border-box scroll;border:none;border-collapse:separate;-webkit-border-image:none;border-image:none;-webkit-border-radius:0;border-radius:0;border-spacing:0;bottom:auto;-webkit-box-shadow:none;box-shadow:none;-webkit-box-sizing:content-box;box-sizing:content-box;caption-side:top;clear:none;clip:auto;color:#000;-webkit-columns:auto;-webkit-column-count:auto;-webkit-column-fill:balance;column-fill:balance;-webkit-column-gap:normal;column-gap:normal;-webkit-column-rule:medium none currentColor;column-rule:medium none currentColor;-webkit-column-span:1;column-span:1;-webkit-column-width:auto;columns:auto;content:normal;counter-increment:none;counter-reset:none;cursor:auto;direction:ltr;display:inline;empty-cells:show;float:none;font-family:serif;font-size:medium;font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;line-height:normal;height:auto;-ms-hyphens:none;hyphens:none;left:auto;letter-spacing:normal;list-style:disc none outside;margin:0;max-height:none;max-width:none;min-height:0;min-width:0;opacity:1;orphans:2;outline:medium none invert;overflow:visible;overflow-x:visible;overflow-y:visible;padding:0;page-break-after:auto;page-break-before:auto;page-break-inside:auto;-webkit-perspective:none;perspective:none;-webkit-perspective-origin:50% 50%;perspective-origin:50% 50%;position:static;right:auto;tab-size:8;table-layout:auto;text-align:left;text-align-last:auto;text-decoration:none;text-indent:0;text-shadow:none;text-transform:none;top:auto;-webkit-transform:none;transform:none;-webkit-transform-origin:50% 50% 0;transform-origin:50% 50% 0;-webkit-transform-style:flat;transform-style:flat;-webkit-transition:none 0s ease 0s;transition:none 0s ease 0s;unicode-bidi:normal;vertical-align:baseline;visibility:visible;white-space:normal;widows:2;width:auto;word-spacing:normal;z-index:auto;all:initial}@media (-webkit-min-device-pixel-ratio:2),(min-resolution:2dppx){.image{background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}}"`
          )
        }
      })
    }
  )
})

describe('Browserslist: New', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'browsers-new')

      let appPort
      let app
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
        const { code } = await nextBuild(appDir, [], {
          stdout: true,
        })
        if (code !== 0) {
          throw new Error('Build failed')
        }
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      it(`should've emitted a single CSS file`, async () => {
        const content = await renderViaHTTP(appPort, '/')
        const $ = cheerio.load(content)

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)

        const stylesheetUrl = cssSheet.attr('href')

        const cssContent = await fetchViaHTTP(appPort, stylesheetUrl).then(
          (res) => res.text()
        )

        const cssContentWithoutSourceMap = cssContent
          .replace(/\/\*.*?\*\/\n?/g, '')
          .trim()

        if (process.env.IS_TURBOPACK_TEST) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"a{all:initial}@media (min-resolution:2x){.image{background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}}"`
          )
        } else {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"a{all:initial}@media (min-resolution:2dppx){.image{background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}}"`
          )
        }
      })
    }
  )
})
