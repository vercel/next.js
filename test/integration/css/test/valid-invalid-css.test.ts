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

const fixturesDir = join(__dirname, '../..', 'css-fixtures')

// Importing module CSS in _document is allowed in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Invalid CSS in _document',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'invalid-module-document')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        it('should fail to build', async () => {
          const { code, stderr } = await nextBuild(appDir, [], {
            stderr: true,
          })
          expect(code).not.toBe(0)
          expect(stderr).toContain('Failed to compile')
          expect(stderr).toContain('styles.module.css')
          expect(stderr).toMatch(
            /CSS.*cannot.*be imported within.*pages[\\/]_document\.js/
          )
          // Skip: Rspack loaders cannot access module issuer info for location details
          if (!process.env.NEXT_RSPACK) {
            expect(stderr).toMatch(/Location:.*pages[\\/]_document\.js/)
          }
        })
      }
    )
  }
)

describe('Invalid Global CSS', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'invalid-global')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })

      it('should fail to build', async () => {
        const { code, stderr } = await nextBuild(appDir, [], {
          stderr: true,
        })
        expect(code).not.toBe(0)
        expect(stderr).toContain('Failed to compile')
        expect(stderr).toContain('styles/global.css')
        expect(stderr).toMatch(
          /Please move all first-party global CSS imports.*?pages(\/|\\)_app/
        )
        // Skip: Rspack loaders cannot access module issuer info for location details
        if (!process.env.NEXT_RSPACK) {
          expect(stderr).toMatch(/Location:.*pages[\\/]index\.js/)
        }
      })
    }
  )
})

describe('Valid Global CSS from npm', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'import-global-from-module')

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

        expect(cssContent).toMatchInlineSnapshot(`".red-text{color:"red"}"`)
      })
    }
  )
})

describe('Invalid Global CSS with Custom App', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'invalid-global-with-app')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })

      it('should fail to build', async () => {
        const { code, stderr } = await nextBuild(appDir, [], {
          stderr: true,
        })
        expect(code).not.toBe(0)
        expect(stderr).toContain('Failed to compile')
        expect(stderr).toContain('styles/global.css')
        expect(stderr).toMatch(
          /Please move all first-party global CSS imports.*?pages(\/|\\)_app/
        )
        // Skip: Rspack loaders cannot access module issuer info for location details
        if (!process.env.NEXT_RSPACK) {
          expect(stderr).toMatch(/Location:.*pages[\\/]index\.js/)
        }
      })
    }
  )
})

describe('Valid and Invalid Global CSS with Custom App', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'valid-and-invalid-global')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })

      it('should fail to build', async () => {
        const { code, stderr } = await nextBuild(appDir, [], {
          stderr: true,
        })
        expect(code).not.toBe(0)
        expect(stderr).toContain('Failed to compile')
        expect(stderr).toContain('styles/global.css')
        expect(stderr).toContain(
          'Please move all first-party global CSS imports'
        )
        // Skip: Rspack loaders cannot access module issuer info for location details
        if (!process.env.NEXT_RSPACK) {
          expect(stderr).toMatch(/Location:.*pages[\\/]index\.js/)
        }
      })
    }
  )
})
