/* eslint-env jest */

import { remove } from 'fs-extra'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  fetchViaHTTP,
} from 'next-test-utils'
import cheerio from 'cheerio'

import { join } from 'path'

const fixturesDir = join(__dirname, '../fixtures')

describe('Custom Properties: Pass-Through IE11', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'cp-ie-11')

      let appPort
      let app
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
        const { code } = await nextBuild(appDir)
        if (code !== 0) {
          throw new Error('failed to build')
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

        const stylesheet = cssSheet.attr('href')

        const cssContent = (
          await fetchViaHTTP(appPort, stylesheet).then((res) => res.text())
        )
          .replace(/\/\*.*?\*\//g, '')
          .trim()

        if (process.env.TURBOPACK) {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
        } else {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
        }
      })
    }
  )
})

describe('Custom Properties: Pass-Through Modern', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'cp-modern')

      let appPort
      let app
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
        const { code } = await nextBuild(appDir)
        if (code !== 0) {
          throw new Error('failed to build')
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

        const stylesheet = cssSheet.attr('href')

        const cssContent = (
          await fetchViaHTTP(appPort, stylesheet).then((res) => res.text())
        )
          .replace(/\/\*.*?\*\//g, '')
          .trim()

        if (process.env.TURBOPACK) {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
        } else {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
        }
      })
    }
  )
})

// This is checking invalid CSS that Lightning CSS in Turbopack interprets differently. Since it's invalid syntax it's documented as unsupported.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Inline Comments: Minify',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'inline-comments')

        let appPort
        let app
        beforeAll(async () => {
          await remove(join(appDir, '.next'))
          const { code } = await nextBuild(appDir)
          if (code !== 0) {
            throw new Error('failed to build')
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

          const stylesheet = cssSheet.attr('href')

          const cssContent = (
            await fetchViaHTTP(appPort, stylesheet).then((res) => res.text())
          )
            .replace(/\/\*.*?\*\//g, '')
            .trim()

          if (process.env.TURBOPACK) {
            expect(
              cssContent.replace(/\/\*.*?\*\//g, '').trim()
            ).toMatchInlineSnapshot(`""`)
          } else {
            expect(
              cssContent.replace(/\/\*.*?\*\//g, '').trim()
            ).toMatchInlineSnapshot(`"*{box-sizing:border-box}"`)
          }
        })
      }
    )
  }
)
