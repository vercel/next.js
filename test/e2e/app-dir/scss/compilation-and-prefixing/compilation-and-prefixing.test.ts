/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

const nextConfig = {
  productionBrowserSourceMaps: true,
}

describe.each([
  { dependencies: { sass: '1.54.0' }, nextConfig },
  {
    dependencies: { 'sass-embedded': '1.75.0' },
    nextConfig: {
      ...nextConfig,
      sassOptions: {
        implementation: 'sass-embedded',
      },
    },
  },
])('SCSS Support ($dependencies)', ({ dependencies, nextConfig }) => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    // This test is skipped because it is reading files in the `.next` file which
    // isn't available/necessary in a deployment environment.
    skipDeployment: true,
    dependencies,
    nextConfig,
  })

  if (skipped) return // TODO: Figure out this test for dev and Turbopack
  ;(isNextDev ? describe.skip : describe)('Production only', () => {
    describe('CSS Compilation and Prefixing', () => {
      it(`should've compiled and prefixed`, async () => {
        const $ = await next.render$('/')

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)

        const stylesheetUrl = cssSheet.attr('href')

        const cssContent = await next
          .fetch(stylesheetUrl)
          .then((res) => res.text())
        const cssContentWithoutSourceMap = cssContent
          .replace(/\/\*.*?\*\//g, '')
          .trim()

        if (process.env.TURBOPACK) {
          if (dependencies.sass) {
            expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
              `".redText ::placeholder{color:red}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}"`
            )
          } else {
            expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
              `".redText ::placeholder{color:red}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}"`
            )
          }
        } else {
          if (dependencies.sass) {
            expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
              `".redText ::placeholder{color:red}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}"`
            )
          } else {
            expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
              `".redText ::placeholder{color:red}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}"`
            )
          }
        }

        // Contains a source map
        expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)

        // Check sourcemap
        const sourceMapUrl = /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//.exec(
          cssContent
        )[1]

        const actualSourceMapUrl = stylesheetUrl.replace(/[^/]+$/, sourceMapUrl)
        const sourceMapContent = await next
          .fetch(actualSourceMapUrl)
          .then((res) => res.text())
        const sourceMapContentParsed = JSON.parse(sourceMapContent)
        // Ensure it doesn't have a specific path in the snapshot.
        delete sourceMapContentParsed.file
        delete sourceMapContentParsed.sources

        if (process.env.TURBOPACK) {
          if (dependencies.sass) {
            expect(sourceMapContentParsed).toMatchInlineSnapshot(`
              {
                "sections": [
                  {
                    "map": {
                      "mappings": "AAAA,iCAAiC",
                      "names": [],
                      "sources": [
                        "turbopack:///[project]/styles/global.scss.css",
                      ],
                      "sourcesContent": [
                        ".redText ::placeholder{color:red}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}",
                      ],
                      "version": 3,
                    },
                    "offset": {
                      "column": 0,
                      "line": 1,
                    },
                  },
                  {
                    "map": {
                      "mappings": "A",
                      "names": [],
                      "sources": [],
                      "version": 3,
                    },
                    "offset": {
                      "column": 91,
                      "line": 1,
                    },
                  },
                ],
                "version": 3,
              }
            `)
          } else {
            expect(sourceMapContentParsed).toMatchInlineSnapshot(`
              {
                "sections": [
                  {
                    "map": {
                      "mappings": "AAAA,iCAAiC",
                      "names": [],
                      "sources": [
                        "turbopack:///[project]/styles/global.scss.css",
                      ],
                      "sourcesContent": [
                        ".redText ::placeholder{color:red}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}",
                      ],
                      "version": 3,
                    },
                    "offset": {
                      "column": 0,
                      "line": 1,
                    },
                  },
                  {
                    "map": {
                      "mappings": "A",
                      "names": [],
                      "sources": [],
                      "version": 3,
                    },
                    "offset": {
                      "column": 91,
                      "line": 1,
                    },
                  },
                ],
                "version": 3,
              }
            `)
          }
        } else {
          if (dependencies.sass) {
            expect(sourceMapContentParsed).toMatchInlineSnapshot(`
              {
                "ignoreList": [],
                "mappings": "AAEE,uBACE,SAHE,CAON,cACE,2CAAA",
                "names": [],
                "sourceRoot": "",
                "sourcesContent": [
                  "$var: red;
              .redText {
                ::placeholder {
                  color: $var;
                }
              }

              .flex-parsing {
                flex: 0 0 calc(50% - var(--vertical-gutter));
              }
              ",
                ],
                "version": 3,
              }
            `)
          } else {
            expect(sourceMapContentParsed).toMatchInlineSnapshot(`
              {
                "ignoreList": [],
                "mappings": "AAEE,uBACE,SAHE,CAON,cACE,2CAAA",
                "names": [],
                "sourceRoot": "",
                "sourcesContent": [
                  "$var: red;
              .redText {
                ::placeholder {
                  color: $var;
                }
              }

              .flex-parsing {
                flex: 0 0 calc(50% - var(--vertical-gutter));
              }
              ",
                ],
                "version": 3,
              }
            `)
          }
        }
      })
    })
  })
})
