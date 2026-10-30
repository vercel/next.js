import path from 'path'
import fs from 'fs-extra'
import { nextTestSetup } from 'e2e-utils'
import escapeStringRegexp from 'escape-string-regexp'

const BUILD_FAILURE_RE = /Build failed because of (webpack|Rspack) errors/

// PostCSS plugins referenced by the `.postcssrc.json` / `postcss.config.js`
// files under `css-fixtures/` must be resolvable from the isolated test
// install. The original integration test relied on these being hoisted in the
// monorepo root, but the isolated next install only sees declared deps.
const postcssPluginDeps = {
  pixrem: '5.0.0',
  'postcss-pseudoelements': '5.0.0',
  'postcss-short-size': '4.0.0',
  'postcss-trolling': '0.1.7',
}

describe('CSS Customization', () => {
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'production mode',
    () => {
      describe('Basic CSS', () => {
        const { next } = nextTestSetup({
          files: path.join(__dirname, 'css-fixtures/custom-configuration'),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        beforeAll(async () => {
          await next.build()
        })

        it('should compile successfully', () => {
          expect(next.cliOutput).toMatch(/Compiled successfully/)
        })

        it(`should've compiled and prefixed`, async () => {
          const cssFolder = path.join(next.testDir, '.next/static/css')

          const files = await fs.readdir(cssFolder)
          const cssFiles = files.filter((f: string) => /\.css$/.test(f))

          expect(cssFiles.length).toBe(1)
          const cssContent = await fs.readFile(
            path.join(cssFolder, cssFiles[0]),
            'utf8'
          )
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(
            `"@media (480px <= width < 768px){::placeholder{color:green}}.video{max-width:400px;max-height:300px}"`
          )

          expect(cssContent).toMatch(
            /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//
          )
        })

        it(`should've emitted a source map`, async () => {
          const cssFolder = path.join(next.testDir, '.next/static/css')

          const files = await fs.readdir(cssFolder)
          const cssMapFiles = files.filter((f: string) => /\.css\.map$/.test(f))

          expect(cssMapFiles.length).toBe(1)
          const cssMapContent = (
            await fs.readFile(path.join(cssFolder, cssMapFiles[0]), 'utf8')
          ).trim()

          const { version, mappings, sourcesContent } =
            JSON.parse(cssMapContent)
          expect({ version, mappings, sourcesContent }).toMatchInlineSnapshot(`
{
  "mappings": "AACA,gCACE,cACE,WACF,CACF,CAGA,OACE,eAA0B,CAA1B,gBACF",
  "sourcesContent": [
    "/* this should pass through untransformed */
@media (480px <= width < 768px) {
  ::placeholder {
    color: green;
  }
}

/* this should be transformed to width/height */
.video {
  -xyz-max-size: 400px 300px;
}
",
  ],
  "version": 3,
}
`)
        })
      })

      describe('Correct CSS Customization Array', () => {
        const { next } = nextTestSetup({
          files: path.join(__dirname, 'css-fixtures/custom-configuration-arr'),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        beforeAll(async () => {
          await next.build()
        })

        it('should compile successfully', () => {
          expect(next.cliOutput).toMatch(/Compiled successfully/)
        })

        it(`should've compiled and prefixed`, async () => {
          const cssFolder = path.join(next.testDir, '.next/static/css')

          const files = await fs.readdir(cssFolder)
          const cssFiles = files.filter((f: string) => /\.css$/.test(f))

          expect(cssFiles.length).toBe(1)
          const cssContent = await fs.readFile(
            path.join(cssFolder, cssFiles[0]),
            'utf8'
          )
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(
            `"@media (480px <= width < 768px){a:before{content:""}::placeholder{color:green}}.video{max-width:6400px;max-height:4800px;max-width:400rem;max-height:300rem}"`
          )

          expect(cssContent).toMatch(
            /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//
          )
        })

        it(`should've emitted a source map`, async () => {
          const cssFolder = path.join(next.testDir, '.next/static/css')

          const files = await fs.readdir(cssFolder)
          const cssMapFiles = files.filter((f: string) => /\.css\.map$/.test(f))

          expect(cssMapFiles.length).toBe(1)
          const cssMapContent = (
            await fs.readFile(path.join(cssFolder, cssMapFiles[0]), 'utf8')
          ).trim()

          const { version, mappings, sourcesContent } =
            JSON.parse(cssMapContent)
          expect({ version, mappings, sourcesContent }).toMatchInlineSnapshot(`
{
  "mappings": "AACA,gCACE,SACE,UACF,CACA,cACE,WACF,CACF,CAGA,OACE,gBAA4B,CAA5B,iBAA4B,CAA5B,gBAA4B,CAA5B,iBACF",
  "sourcesContent": [
    "/* this should pass through untransformed */
@media (480px <= width < 768px) {
  a::before {
    content: '';
  }
  ::placeholder {
    color: green;
  }
}

/* this should be transformed to width/height */
.video {
  -xyz-max-size: 400rem 300rem;
}
",
  ],
  "version": 3,
}
`)
        })
      })

      describe('Correct CSS Customization custom loader', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/custom-configuration-loader'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        beforeAll(async () => {
          await next.build()
        })

        it('should compile successfully', () => {
          expect(next.cliOutput).toMatch(
            /Built-in CSS support is being disabled/
          )
          expect(next.cliOutput).toMatch(/Compiled successfully/)
        })

        it(`should've applied style`, async () => {
          const pagesFolder = path.join(
            next.testDir,
            '.next/static/chunks/pages'
          )

          const files = await fs.readdir(pagesFolder)
          const indexFiles = files.filter((f: string) =>
            /^index.+\.js$/.test(f)
          )

          expect(indexFiles.length).toBe(1)
          const indexContent = await fs.readFile(
            path.join(pagesFolder, indexFiles[0]),
            'utf8'
          )
          expect(indexContent).toMatch(/\.my-text\.jsx-[0-9a-z]+{color:red}/)
        })
      })

      describe('Bad CSS Customization', () => {
        const { next } = nextTestSetup({
          files: path.join(__dirname, 'css-fixtures/bad-custom-configuration'),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        beforeAll(async () => {
          await next.build()
        })

        it('should compile successfully', () => {
          expect(next.cliOutput).toMatch(/Compiled successfully/)
          expect(next.cliOutput).toMatch(
            /field which is not supported.*?sourceMap/
          )
          ;[
            'postcss-modules-values',
            'postcss-modules-scope',
            'postcss-modules-extract-imports',
            'postcss-modules-local-by-default',
            'postcss-modules',
          ].forEach((plugin) => {
            expect(next.cliOutput).toMatch(
              new RegExp(`Please remove the.*?${escapeStringRegexp(plugin)}`)
            )
          })
        })

        it(`should've compiled and prefixed`, async () => {
          const cssFolder = path.join(next.testDir, '.next/static/css')

          const files = await fs.readdir(cssFolder)
          const cssFiles = files.filter((f: string) => /\.css$/.test(f))

          expect(cssFiles.length).toBe(1)
          const cssContent = await fs.readFile(
            path.join(cssFolder, cssFiles[0]),
            'utf8'
          )
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(`".video{max-width:400px;max-height:300px}"`)

          expect(cssContent).toMatch(
            /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//
          )
        })

        it(`should've emitted a source map`, async () => {
          const cssFolder = path.join(next.testDir, '.next/static/css')

          const files = await fs.readdir(cssFolder)
          const cssMapFiles = files.filter((f: string) => /\.css\.map$/.test(f))

          expect(cssMapFiles.length).toBe(1)
        })
      })

      describe('Bad CSS Customization Array (1)', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/bad-custom-configuration-arr-1'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        it('should fail the build', async () => {
          await next.build()

          expect(next.cliOutput).toMatch(
            /A PostCSS Plugin was passed as an array but did not provide its configuration \('postcss-trolling'\)/
          )
          expect(next.cliOutput).toMatch(BUILD_FAILURE_RE)
        })
      })

      describe('Bad CSS Customization Array (2)', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/bad-custom-configuration-arr-2'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        it('should fail the build', async () => {
          await next.build()

          expect(next.cliOutput).toMatch(
            /Error: Your PostCSS configuration for 'postcss-trolling' cannot have null configuration./
          )
          expect(next.cliOutput).toMatch(
            /To disable 'postcss-trolling', pass false, otherwise, pass true or a configuration object./
          )
          expect(next.cliOutput).toMatch(BUILD_FAILURE_RE)
        })
      })

      describe('Bad CSS Customization Array (3)', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/bad-custom-configuration-arr-3'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        it('should fail the build', async () => {
          await next.build()

          expect(next.cliOutput).toMatch(
            /A PostCSS Plugin must be provided as a string. Instead, we got: '5'/
          )
          expect(next.cliOutput).toMatch(BUILD_FAILURE_RE)
        })
      })

      describe('Bad CSS Customization Array (4)', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/bad-custom-configuration-arr-4'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        it('should fail the build', async () => {
          await next.build()

          expect(next.cliOutput).toMatch(
            /An unknown PostCSS plugin was provided \(5\)/
          )
          expect(next.cliOutput).toMatch(BUILD_FAILURE_RE)
        })
      })

      describe('Bad CSS Customization Array (5)', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/bad-custom-configuration-arr-5'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        it('should fail the build', async () => {
          await next.build()

          expect(next.cliOutput).toMatch(
            /Your custom PostCSS configuration must export a `plugins` key./
          )
          expect(next.cliOutput).toMatch(BUILD_FAILURE_RE)
        })
      })

      describe('Bad CSS Customization Array (6)', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/bad-custom-configuration-arr-6'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        it('should fail the build', async () => {
          await next.build()

          expect(next.cliOutput).toMatch(
            /Your custom PostCSS configuration must export a `plugins` key./
          )
          expect(next.cliOutput).toMatch(BUILD_FAILURE_RE)
        })
      })

      describe('Bad CSS Customization Array (7)', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/bad-custom-configuration-arr-7'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        it('should fail the build', async () => {
          await next.build()

          expect(next.cliOutput).toMatch(
            /A PostCSS Plugin was passed as an array but did not provide its configuration \('postcss-trolling'\)/
          )
          expect(next.cliOutput).toMatch(BUILD_FAILURE_RE)
        })
      })

      describe('Bad CSS Customization Array (8)', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/bad-custom-configuration-arr-8'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        it('should fail the build', async () => {
          await next.build()

          expect(next.cliOutput).toMatch(
            /A PostCSS Plugin was passed as a function using require\(\), but it must be provided as a string/
          )
          expect(next.cliOutput).toMatch(BUILD_FAILURE_RE)
        })
      })

      describe('Bad CSS Customization Function', () => {
        const { next } = nextTestSetup({
          files: path.join(
            __dirname,
            'css-fixtures/bad-custom-configuration-func'
          ),
          skipStart: true,
          dependencies: postcssPluginDeps,
        })

        it('should fail the build', async () => {
          await next.build()

          expect(next.cliOutput).toMatch(
            /Your custom PostCSS configuration may not export a function/
          )
          expect(next.cliOutput).toMatch(BUILD_FAILURE_RE)
        })
      })
    }
  )
})
