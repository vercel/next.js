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

// Turbopack uses LightningCSS which supports scoping `:root` to the CSS module.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Custom Properties: Fail for :root {} in CSS Modules',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'cp-global-modules')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        it('should fail to build', async () => {
          const { code, stderr } = await nextBuild(appDir, [], {
            stderr: true,
          })
          expect(code).not.toBe(0)
          expect(stderr).toContain('Failed to compile')
          expect(stderr).toContain('pages/styles.module.css')
          expect(stderr).toContain('Selector ":root" is not pure')
        })
      }
    )
  }
)

describe('Custom Properties: Fail for global element in CSS Modules', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'cp-el-modules')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })

      it('should fail to build', async () => {
        const { code, stderr } = await nextBuild(appDir, [], {
          stderr: true,
        })
        expect(code).not.toBe(0)
        if (process.env.IS_TURBOPACK_TEST) {
          expect(stderr).toContain('pages/styles.module.css')
          expect(stderr).toContain('Selector "h1" is not pure')
        } else {
          expect(stderr).toContain('Failed to compile')
          expect(stderr).toContain('pages/styles.module.css')
          expect(stderr).toContain('Selector "h1" is not pure')
        }
      })
    }
  )
})

describe('CSS Modules: Import Global CSS', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'module-import-global')

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

        if (process.env.IS_TURBOPACK_TEST) {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(`"a .foo{all:initial}"`)
        } else {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(`"a .styles_foo__G5630{all:initial}"`)
        }
      })
    }
  )
})
// Disabled with Turbopack because importing `.css` files in `.module.css` is handled as `.css` file not `.module.css` file
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'CSS Modules: Importing Invalid Global CSS',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'module-import-global-invalid')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        // eslint-disable-next-line jest/no-identical-title
        it('should fail to build', async () => {
          const { code, stderr } = await nextBuild(appDir, [], {
            stderr: true,
          })
          expect(code).not.toBe(0)
          expect(stderr).toContain('Failed to compile')
          expect(stderr).toContain('pages/styles.css')
          expect(stderr).toContain('Selector "a" is not pure')
        })
      }
    )
  }
)

// Turbopack uses LightningCSS which doesn't support `@value`.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'CSS Modules: Import Exports',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'module-import-exports')

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

          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(`".styles_blk__480DC{color:#000000}"`)
        })
      }
    )
  }
)
