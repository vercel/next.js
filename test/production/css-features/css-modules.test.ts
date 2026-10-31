/* eslint-disable jest/no-identical-title */
import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

// Turbopack uses LightningCSS which supports scoping `:root` to the CSS module.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Custom Properties: Fail for :root {} in CSS Modules',
  () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'cp-global-modules'),
      skipStart: true,
    })

    it('should fail to build', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('Failed to compile')
      expect(cliOutput).toContain('pages/styles.module.css')
      expect(cliOutput).toContain('Selector ":root" is not pure')
    })
  }
)

describe('Custom Properties: Fail for global element in CSS Modules', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'cp-el-modules'),
    skipStart: true,
  })

  it('should fail to build', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    if (isTurbopack) {
      expect(cliOutput).toContain('pages/styles.module.css')
      expect(cliOutput).toContain('Selector "h1" is not pure')
    } else {
      expect(cliOutput).toContain('Failed to compile')
      expect(cliOutput).toContain('pages/styles.module.css')
      expect(cliOutput).toContain('Selector "h1" is not pure')
    }
  })
})

describe('CSS Modules: Import Global CSS', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'module-import-global'),
  })

  it(`should've emitted a single CSS file`, async () => {
    const $ = await next.render$('/')

    const cssSheet = $('link[rel="stylesheet"]')
    expect(cssSheet.length).toBe(1)

    const stylesheet = cssSheet.attr('href')!
    const cssContent = (await next.fetch(stylesheet).then((res) => res.text()))
      .replace(/\/\*.*?\*\//g, '')
      .trim()

    if (isTurbopack) {
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`"a .foo{all:initial}"`)
    } else {
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`"a .styles_foo__G5630{all:initial}"`)
    }
  })
})

// Disabled with Turbopack: importing `.css` files in `.module.css` is handled as `.css` file not `.module.css` file
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'CSS Modules: Importing Invalid Global CSS',
  () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'module-import-global-invalid'),
      skipStart: true,
    })

    it('should fail to build', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('Failed to compile')
      expect(cliOutput).toContain('pages/styles.css')
      expect(cliOutput).toContain('Selector "a" is not pure')
    })
  }
)

// Turbopack uses LightningCSS which doesn't support `@value`.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'CSS Modules: Import Exports',
  () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'module-import-exports'),
    })

    it(`should've emitted a single CSS file`, async () => {
      const $ = await next.render$('/')

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)

      const stylesheet = cssSheet.attr('href')!
      const cssContent = (
        await next.fetch(stylesheet).then((res) => res.text())
      )
        .replace(/\/\*.*?\*\//g, '')
        .trim()

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".styles_blk__480DC{color:#000000}"`)
    })
  }
)
