/* eslint-env jest */

import { join } from 'path'
import { readdir, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import escapeStringRegexp from 'escape-string-regexp'

const fixturesDir = join(__dirname, '../..', 'css-fixtures')
const BUILD_FAILURE_RE = /Build failed because of (webpack|Rspack) errors/

// Test checks webpack loaders and plugins.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'CSS Customization',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const appDir = join(fixturesDir, 'custom-configuration')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        describe('Basic CSS', () => {
          it('should compile successfully', async () => {
            const { code, stdout } = await nextBuild(appDir, [], {
              stdout: true,
            })
            expect(code).toBe(0)
            expect(stdout).toMatch(/Compiled successfully/)
          })

          it(`should've compiled and prefixed`, async () => {
            const cssFolder = join(appDir, '.next/static/css')

            const files = await readdir(cssFolder)
            const cssFiles = files.filter((f) => /\.css$/.test(f))

            expect(cssFiles.length).toBe(1)
            const cssContent = await readFile(
              join(cssFolder, cssFiles[0]),
              'utf8'
            )
            expect(
              cssContent.replace(/\/\*.*?\*\//g, '').trim()
            ).toMatchInlineSnapshot(
              `"@media (480px <= width < 768px){::placeholder{color:green}}.video{max-width:400px;max-height:300px}"`
            )

            // Contains a source map
            expect(cssContent).toMatch(
              /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//
            )
          })

          it(`should've emitted a source map`, async () => {
            const cssFolder = join(appDir, '.next/static/css')

            const files = await readdir(cssFolder)
            const cssMapFiles = files.filter((f) => /\.css\.map$/.test(f))

            expect(cssMapFiles.length).toBe(1)
            const cssMapContent = (
              await readFile(join(cssFolder, cssMapFiles[0]), 'utf8')
            ).trim()

            const { version, mappings, sourcesContent } =
              JSON.parse(cssMapContent)
            expect({ version, mappings, sourcesContent })
              .toMatchInlineSnapshot(`
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
          const appDir = join(fixturesDir, 'custom-configuration-arr')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should compile successfully', async () => {
            const { code, stdout } = await nextBuild(appDir, [], {
              stdout: true,
            })
            expect(code).toBe(0)
            expect(stdout).toMatch(/Compiled successfully/)
          })

          it(`should've compiled and prefixed`, async () => {
            const cssFolder = join(appDir, '.next/static/css')

            const files = await readdir(cssFolder)
            const cssFiles = files.filter((f) => /\.css$/.test(f))

            expect(cssFiles.length).toBe(1)
            const cssContent = await readFile(
              join(cssFolder, cssFiles[0]),
              'utf8'
            )
            expect(
              cssContent.replace(/\/\*.*?\*\//g, '').trim()
            ).toMatchInlineSnapshot(
              `"@media (480px <= width < 768px){a:before{content:""}::placeholder{color:green}}.video{max-width:6400px;max-height:4800px;max-width:400rem;max-height:300rem}"`
            )

            // Contains a source map
            expect(cssContent).toMatch(
              /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//
            )
          })

          it(`should've emitted a source map`, async () => {
            const cssFolder = join(appDir, '.next/static/css')

            const files = await readdir(cssFolder)
            const cssMapFiles = files.filter((f) => /\.css\.map$/.test(f))

            expect(cssMapFiles.length).toBe(1)
            const cssMapContent = (
              await readFile(join(cssFolder, cssMapFiles[0]), 'utf8')
            ).trim()

            const { version, mappings, sourcesContent } =
              JSON.parse(cssMapContent)
            expect({ version, mappings, sourcesContent })
              .toMatchInlineSnapshot(`
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
          const appDir = join(fixturesDir, 'custom-configuration-loader')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should compile successfully', async () => {
            const { code, stdout, stderr } = await nextBuild(appDir, [], {
              stdout: true,
              stderr: true,
            })
            expect(code).toBe(0)
            expect(stderr).toMatch(/Built-in CSS support is being disabled/)
            expect(stdout).toMatch(/Compiled successfully/)
          })

          it(`should've applied style`, async () => {
            const pagesFolder = join(appDir, '.next/static/chunks/pages')

            const files = await readdir(pagesFolder)
            const indexFiles = files.filter((f) => /^index.+\.js$/.test(f))

            expect(indexFiles.length).toBe(1)
            const indexContent = await readFile(
              join(pagesFolder, indexFiles[0]),
              'utf8'
            )
            expect(indexContent).toMatch(/\.my-text\.jsx-[0-9a-z]+{color:red}/)
          })
        })

        describe('Bad CSS Customization', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should compile successfully', async () => {
            const { stdout, stderr } = await nextBuild(appDir, [], {
              stdout: true,
              stderr: true,
            })
            expect(stdout).toMatch(/Compiled successfully/)
            expect(stderr).toMatch(/field which is not supported.*?sourceMap/)
            ;[
              'postcss-modules-values',
              'postcss-modules-scope',
              'postcss-modules-extract-imports',
              'postcss-modules-local-by-default',
              'postcss-modules',
            ].forEach((plugin) => {
              expect(stderr).toMatch(
                new RegExp(`Please remove the.*?${escapeStringRegexp(plugin)}`)
              )
            })
          })

          it(`should've compiled and prefixed`, async () => {
            const cssFolder = join(appDir, '.next/static/css')

            const files = await readdir(cssFolder)
            const cssFiles = files.filter((f) => /\.css$/.test(f))

            expect(cssFiles.length).toBe(1)
            const cssContent = await readFile(
              join(cssFolder, cssFiles[0]),
              'utf8'
            )
            expect(
              cssContent.replace(/\/\*.*?\*\//g, '').trim()
            ).toMatchInlineSnapshot(
              `".video{max-width:400px;max-height:300px}"`
            )

            // Contains a source map
            expect(cssContent).toMatch(
              /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//
            )
          })

          it(`should've emitted a source map`, async () => {
            const cssFolder = join(appDir, '.next/static/css')

            const files = await readdir(cssFolder)
            const cssMapFiles = files.filter((f) => /\.css\.map$/.test(f))

            expect(cssMapFiles.length).toBe(1)
          })
        })

        describe('Bad CSS Customization Array (1)', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration-arr-1')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should fail the build', async () => {
            const { stderr } = await nextBuild(appDir, [], { stderr: true })

            expect(stderr).toMatch(
              /A PostCSS Plugin was passed as an array but did not provide its configuration \('postcss-trolling'\)/
            )
            expect(stderr).toMatch(BUILD_FAILURE_RE)
          })
        })

        describe('Bad CSS Customization Array (2)', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration-arr-2')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should fail the build', async () => {
            const { stderr } = await nextBuild(appDir, [], { stderr: true })

            expect(stderr).toMatch(
              /Error: Your PostCSS configuration for 'postcss-trolling' cannot have null configuration./
            )
            expect(stderr).toMatch(
              /To disable 'postcss-trolling', pass false, otherwise, pass true or a configuration object./
            )
            expect(stderr).toMatch(BUILD_FAILURE_RE)
          })
        })

        describe('Bad CSS Customization Array (3)', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration-arr-3')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should fail the build', async () => {
            const { stderr } = await nextBuild(appDir, [], { stderr: true })

            expect(stderr).toMatch(
              /A PostCSS Plugin must be provided as a string. Instead, we got: '5'/
            )
            expect(stderr).toMatch(BUILD_FAILURE_RE)
          })
        })

        describe('Bad CSS Customization Array (4)', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration-arr-4')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should fail the build', async () => {
            const { stderr } = await nextBuild(appDir, [], { stderr: true })

            expect(stderr).toMatch(
              /An unknown PostCSS plugin was provided \(5\)/
            )
            expect(stderr).toMatch(BUILD_FAILURE_RE)
          })
        })

        describe('Bad CSS Customization Array (5)', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration-arr-5')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should fail the build', async () => {
            const { stderr } = await nextBuild(appDir, [], { stderr: true })

            expect(stderr).toMatch(
              /Your custom PostCSS configuration must export a `plugins` key./
            )
            expect(stderr).toMatch(BUILD_FAILURE_RE)
          })
        })

        describe('Bad CSS Customization Array (6)', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration-arr-6')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should fail the build', async () => {
            const { stderr } = await nextBuild(appDir, [], { stderr: true })

            expect(stderr).toMatch(
              /Your custom PostCSS configuration must export a `plugins` key./
            )
            expect(stderr).toMatch(BUILD_FAILURE_RE)
          })
        })

        describe('Bad CSS Customization Array (7)', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration-arr-7')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should fail the build', async () => {
            const { stderr } = await nextBuild(appDir, [], { stderr: true })

            expect(stderr).toMatch(
              /A PostCSS Plugin was passed as an array but did not provide its configuration \('postcss-trolling'\)/
            )
            expect(stderr).toMatch(BUILD_FAILURE_RE)
          })
        })

        describe('Bad CSS Customization Array (8)', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration-arr-8')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should fail the build', async () => {
            const { stderr } = await nextBuild(appDir, [], { stderr: true })

            expect(stderr).toMatch(
              /A PostCSS Plugin was passed as a function using require\(\), but it must be provided as a string/
            )
            expect(stderr).toMatch(BUILD_FAILURE_RE)
          })
        })

        describe('Bad CSS Customization Function', () => {
          const appDir = join(fixturesDir, 'bad-custom-configuration-func')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should fail the build', async () => {
            const { stderr } = await nextBuild(appDir, [], { stderr: true })

            expect(stderr).toMatch(
              /Your custom PostCSS configuration may not export a function/
            )
            expect(stderr).toMatch(BUILD_FAILURE_RE)
          })
        })
      }
    )
  }
)
