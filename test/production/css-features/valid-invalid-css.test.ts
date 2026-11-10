import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

// Importing module CSS in _document is allowed in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Invalid CSS in _document',
  () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'invalid-module-document'),
      skipStart: true,
    })

    it('should fail to build', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('Failed to compile')
      expect(cliOutput).toContain('styles.module.css')
      expect(cliOutput).toMatch(
        /CSS.*cannot.*be imported within.*pages[\\/]_document\.js/
      )
      // Skip: Rspack loaders cannot access module issuer info for location details
      if (!process.env.NEXT_RSPACK) {
        expect(cliOutput).toMatch(/Location:.*pages[\\/]_document\.js/)
      }
    })
  }
)

describe('Invalid Global CSS', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'invalid-global'),
    skipStart: true,
  })

  it('should fail to build', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    if (!isTurbopack) {
      expect(cliOutput).toContain('Failed to compile')
    }
    expect(cliOutput).toContain('styles/global.css')
    expect(cliOutput).toMatch(
      /Please move all first-party global CSS imports.*?pages(\/|\\)_app/
    )
    // Skip: Rspack loaders cannot access module issuer info for location details
    if (!process.env.NEXT_RSPACK) {
      expect(cliOutput).toMatch(/Location:.*pages[\\/]index\.js/)
    }
  })
})

describe('Valid Global CSS from npm', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'import-global-from-module'),
  })

  it(`should've emitted a single CSS file`, async () => {
    const $ = await next.render$('/')

    const cssSheet = $('link[rel="stylesheet"]')
    expect(cssSheet.length).toBe(1)

    const stylesheet = cssSheet.attr('href')!
    const cssContent = (await next.fetch(stylesheet).then((res) => res.text()))
      .replace(/\/\*.*?\*\//g, '')
      .trim()

    expect(cssContent).toMatchInlineSnapshot(`".red-text{color:"red"}"`)
  })
})

describe('Invalid Global CSS with Custom App', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'invalid-global-with-app'),
    skipStart: true,
  })

  it('should fail to build', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    if (!isTurbopack) {
      expect(cliOutput).toContain('Failed to compile')
    }
    expect(cliOutput).toContain('styles/global.css')
    expect(cliOutput).toMatch(
      /Please move all first-party global CSS imports.*?pages(\/|\\)_app/
    )
    // Skip: Rspack loaders cannot access module issuer info for location details
    if (!process.env.NEXT_RSPACK) {
      expect(cliOutput).toMatch(/Location:.*pages[\\/]index\.js/)
    }
  })
})

describe('Valid and Invalid Global CSS with Custom App', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'valid-and-invalid-global'),
    skipStart: true,
  })

  it('should fail to build', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    if (!isTurbopack) {
      expect(cliOutput).toContain('Failed to compile')
    }
    expect(cliOutput).toContain('styles/global.css')
    expect(cliOutput).toContain(
      'Please move all first-party global CSS imports'
    )
    // Skip: Rspack loaders cannot access module issuer info for location details
    if (!process.env.NEXT_RSPACK) {
      expect(cliOutput).toMatch(/Location:.*pages[\\/]index\.js/)
    }
  })
})
