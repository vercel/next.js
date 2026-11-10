import type { NextConfig } from 'next'
import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

/** Mirrors `test/production/css-customization/css-fixtures/next.config.js` merged into each fixture. */
const cssFixturesNextConfigBase = {
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60,
  },
  productionBrowserSourceMaps: true,
} satisfies NextConfig

describe('CSS Support', () => {
  describe('CSS Compilation and Prefixing', () => {
    describe('without lightningcss', () => {
      const useLightningcss = false
      const { next, isTurbopack } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'compilation-and-prefixing'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: false,
          },
        },
        packageJson: {
          browserslist: ['chrome 60'],
        },
      })

      it(`should've compiled and prefixed`, async () => {
        const $ = await next.render$('/')

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)

        const stylesheetUrl = cssSheet.attr('href')!

        const cssContent = await next
          .fetch(stylesheetUrl)
          .then((res) => res.text())

        const cssContentWithoutSourceMap = cssContent
          .replace(/\/\*.*?\*\/\n?/g, '')
          .trim()

        if (isTurbopack && useLightningcss) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0px, 0px)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
          )
        } else if (isTurbopack && !useLightningcss) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0px, 0px)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
          )
        } else if (process.env.NEXT_RSPACK && useLightningcss) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0px, 0px)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
          )
        } else if (useLightningcss) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0,0)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
          )
        } else {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (max-width:767px){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0,0)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:80%}"`
          )
        }

        // Contains a source map
        expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)

        const sourceMapUrl = /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//.exec(
          cssContent
        )![1]
        const actualSourceMapUrl = stylesheetUrl.replace(
          /(?<=^|\/)[^/?]+(?=$|\?)/,
          sourceMapUrl
        )

        const sourceMapContent = await next
          .fetch(actualSourceMapUrl)
          .then((res) => res.text())
        const sourceMapContentParsed = JSON.parse(sourceMapContent)
        // Ensure it doesn't have a specific path in the snapshot.
        delete sourceMapContentParsed.file
        delete sourceMapContentParsed.sources

        if (isTurbopack) {
          // Turbopack always uses lightningcss
          expect(sourceMapContentParsed).toMatchInlineSnapshot(`
               {
                 "mappings": "AAAA,qDACE,2BAKF,0DAIA,mDAIA,uCAIA",
                 "names": [],
                 "sourcesContent": [
                   "@media (480px <= width < 768px) {
                 ::placeholder {
                   color: green;
                 }
               }

               .flex-parsing {
                 flex: 0 0 calc(50% - var(--vertical-gutter));
               }

               .transform-parsing {
                 transform: translate3d(0px, 0px);
               }

               .css-grid-shorthand {
                 grid-column: span 2;
               }

               .g-docs-sidenav .filter::-webkit-input-placeholder {
                 opacity: 80%;
               }
               ",
                 ],
                 "version": 3,
               }
              `)
        } else if (process.env.NEXT_RSPACK && !useLightningcss) {
          expect(sourceMapContentParsed).toMatchInlineSnapshot(`
                 {
                   "mappings": "AAAA,+CACE,cACE,WACF,CACF,CAEA,cACE,2CACF,CAEA,mBACE,0BACF,CAEA,oBACE,kBACF,CAEA,mDACE,WACF",
                   "names": [],
                   "sourcesContent": [
                     "@media (480px <= width < 768px) {
                   ::placeholder {
                     color: green;
                   }
                 }

                 .flex-parsing {
                   flex: 0 0 calc(50% - var(--vertical-gutter));
                 }

                 .transform-parsing {
                   transform: translate3d(0px, 0px);
                 }

                 .css-grid-shorthand {
                   grid-column: span 2;
                 }

                 .g-docs-sidenav .filter::-webkit-input-placeholder {
                   opacity: 80%;
                 }
                 ",
                   ],
                   "version": 3,
                 }
                `)
        } else if (useLightningcss) {
          expect(sourceMapContentParsed).toMatchInlineSnapshot(`
                 {
                   "ignoreList": [],
                   "mappings": "AAAA,qDACE,cACE,WACF,CACF,CAEA,cACE,2CACF,CAEA,mBACE,0BACF,CAEA,oBACE,kBACF,CAEA,mDACE,UACF",
                   "names": [],
                   "sourceRoot": "",
                   "sourcesContent": [
                     "@media (min-width: 480px) and (not (min-width: 768px)) {
                   ::placeholder {
                     color: green;
                   }
                 }

                 .flex-parsing {
                   flex: 0 0 calc(50% - var(--vertical-gutter));
                 }

                 .transform-parsing {
                   transform: translate3d(0px, 0px);
                 }

                 .css-grid-shorthand {
                   grid-column: span 2;
                 }

                 .g-docs-sidenav .filter::-webkit-input-placeholder {
                   opacity: .8;
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
                    "mappings": "AAAA,+CACE,cACE,WACF,CACF,CAEA,cACE,2CACF,CAEA,mBACE,0BACF,CAEA,oBACE,kBACF,CAEA,mDACE,WACF",
                    "names": [],
                    "sourceRoot": "",
                    "sourcesContent": [
                      "@media (480px <= width < 768px) {
                    ::placeholder {
                      color: green;
                    }
                  }

                  .flex-parsing {
                    flex: 0 0 calc(50% - var(--vertical-gutter));
                  }

                  .transform-parsing {
                    transform: translate3d(0px, 0px);
                  }

                  .css-grid-shorthand {
                    grid-column: span 2;
                  }

                  .g-docs-sidenav .filter::-webkit-input-placeholder {
                    opacity: 80%;
                  }
                  ",
                    ],
                    "version": 3,
                  }
                `)
        }

        const inlineStyle = $('style')
        expect(inlineStyle.length).toBe(1)
        const inlineCssContent = inlineStyle
          .html()!
          .replace(
            /media-query-test.jsx-[a-f0-9]{16}/g,
            'media-query-test.jsx-HASH'
          )
        if (isTurbopack && useLightningcss) {
          expect(inlineCssContent).toMatchInlineSnapshot(
            `".media-query-test.jsx-HASH{color:#00f}@media (max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
          )
        } else if (isTurbopack && !useLightningcss) {
          expect(inlineCssContent).toMatchInlineSnapshot(
            `".media-query-test.jsx-HASH{color:#00f}@media (max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
          )
        } else if (useLightningcss) {
          expect(inlineCssContent).toMatchInlineSnapshot(
            `".media-query-test.jsx-HASH{color:blue}@media(max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
          )
        } else {
          expect(inlineCssContent).toMatchInlineSnapshot(
            `".media-query-test.jsx-HASH{color:blue}@media(max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
          )
        }
      })
    })

    describe('with lightningcss', () => {
      const useLightningcss = true
      const { next, isTurbopack } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'compilation-and-prefixing'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: true,
          },
        },
        packageJson: {
          browserslist: ['chrome 60'],
        },
      })

      it(`should've compiled and prefixed`, async () => {
        const $ = await next.render$('/')

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)

        const stylesheetUrl = cssSheet.attr('href')!

        const cssContent = await next
          .fetch(stylesheetUrl)
          .then((res) => res.text())

        const cssContentWithoutSourceMap = cssContent
          .replace(/\/\*.*?\*\/\n?/g, '')
          .trim()

        if (isTurbopack && useLightningcss) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0px, 0px)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
          )
        } else if (isTurbopack && !useLightningcss) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0px, 0px)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
          )
        } else if (process.env.NEXT_RSPACK && useLightningcss) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0px, 0px)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
          )
        } else if (useLightningcss) {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0,0)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
          )
        } else {
          expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
            `"@media (min-width:480px) and (max-width:767px){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0,0)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:80%}"`
          )
        }

        // Contains a source map
        expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)

        const sourceMapUrl = /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//.exec(
          cssContent
        )![1]
        const actualSourceMapUrl = stylesheetUrl.replace(
          /(?<=^|\/)[^/?]+(?=$|\?)/,
          sourceMapUrl
        )

        const sourceMapContent = await next
          .fetch(actualSourceMapUrl)
          .then((res) => res.text())
        const sourceMapContentParsed = JSON.parse(sourceMapContent)
        // Ensure it doesn't have a specific path in the snapshot.
        delete sourceMapContentParsed.file
        delete sourceMapContentParsed.sources

        if (isTurbopack) {
          // Turbopack always uses lightningcss
          expect(sourceMapContentParsed).toMatchInlineSnapshot(`
               {
                 "mappings": "AAAA,qDACE,2BAKF,0DAIA,mDAIA,uCAIA",
                 "names": [],
                 "sourcesContent": [
                   "@media (480px <= width < 768px) {
                 ::placeholder {
                   color: green;
                 }
               }

               .flex-parsing {
                 flex: 0 0 calc(50% - var(--vertical-gutter));
               }

               .transform-parsing {
                 transform: translate3d(0px, 0px);
               }

               .css-grid-shorthand {
                 grid-column: span 2;
               }

               .g-docs-sidenav .filter::-webkit-input-placeholder {
                 opacity: 80%;
               }
               ",
                 ],
                 "version": 3,
               }
              `)
        } else if (process.env.NEXT_RSPACK && !useLightningcss) {
          expect(sourceMapContentParsed).toMatchInlineSnapshot(`
                 {
                   "mappings": "AAAA,+CACE,cACE,WACF,CACF,CAEA,cACE,2CACF,CAEA,mBACE,0BACF,CAEA,oBACE,kBACF,CAEA,mDACE,WACF",
                   "names": [],
                   "sourcesContent": [
                     "@media (480px <= width < 768px) {
                   ::placeholder {
                     color: green;
                   }
                 }

                 .flex-parsing {
                   flex: 0 0 calc(50% - var(--vertical-gutter));
                 }

                 .transform-parsing {
                   transform: translate3d(0px, 0px);
                 }

                 .css-grid-shorthand {
                   grid-column: span 2;
                 }

                 .g-docs-sidenav .filter::-webkit-input-placeholder {
                   opacity: 80%;
                 }
                 ",
                   ],
                   "version": 3,
                 }
                `)
        } else if (useLightningcss) {
          expect(sourceMapContentParsed).toMatchInlineSnapshot(`
                 {
                   "ignoreList": [],
                   "mappings": "AAAA,qDACE,cACE,WACF,CACF,CAEA,cACE,2CACF,CAEA,mBACE,0BACF,CAEA,oBACE,kBACF,CAEA,mDACE,UACF",
                   "names": [],
                   "sourceRoot": "",
                   "sourcesContent": [
                     "@media (min-width: 480px) and (not (min-width: 768px)) {
                   ::placeholder {
                     color: green;
                   }
                 }

                 .flex-parsing {
                   flex: 0 0 calc(50% - var(--vertical-gutter));
                 }

                 .transform-parsing {
                   transform: translate3d(0px, 0px);
                 }

                 .css-grid-shorthand {
                   grid-column: span 2;
                 }

                 .g-docs-sidenav .filter::-webkit-input-placeholder {
                   opacity: .8;
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
                    "mappings": "AAAA,+CACE,cACE,WACF,CACF,CAEA,cACE,2CACF,CAEA,mBACE,0BACF,CAEA,oBACE,kBACF,CAEA,mDACE,WACF",
                    "names": [],
                    "sourceRoot": "",
                    "sourcesContent": [
                      "@media (480px <= width < 768px) {
                    ::placeholder {
                      color: green;
                    }
                  }

                  .flex-parsing {
                    flex: 0 0 calc(50% - var(--vertical-gutter));
                  }

                  .transform-parsing {
                    transform: translate3d(0px, 0px);
                  }

                  .css-grid-shorthand {
                    grid-column: span 2;
                  }

                  .g-docs-sidenav .filter::-webkit-input-placeholder {
                    opacity: 80%;
                  }
                  ",
                    ],
                    "version": 3,
                  }
                `)
        }

        const inlineStyle = $('style')
        expect(inlineStyle.length).toBe(1)
        const inlineCssContent = inlineStyle
          .html()!
          .replace(
            /media-query-test.jsx-[a-f0-9]{16}/g,
            'media-query-test.jsx-HASH'
          )
        if (isTurbopack && useLightningcss) {
          expect(inlineCssContent).toMatchInlineSnapshot(
            `".media-query-test.jsx-HASH{color:#00f}@media (max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
          )
        } else if (isTurbopack && !useLightningcss) {
          expect(inlineCssContent).toMatchInlineSnapshot(
            `".media-query-test.jsx-HASH{color:#00f}@media (max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
          )
        } else if (useLightningcss) {
          expect(inlineCssContent).toMatchInlineSnapshot(
            `".media-query-test.jsx-HASH{color:blue}@media(max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
          )
        } else {
          expect(inlineCssContent).toMatchInlineSnapshot(
            `".media-query-test.jsx-HASH{color:blue}@media(max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
          )
        }
      })
    })
  })

  describe('React Lifecyce Order (production)', () => {
    describe('without lightningcss', () => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'transition-react'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: false,
          },
        },
      })

      it('should have the correct color on mount after navigation', async () => {
        let browser
        try {
          browser = await next.browser('/')

          // Navigate to other:
          await browser.waitForElementByCss('#link-other').click()
          const text = await browser.waitForElementByCss('#red-title').text()
          expect(text).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    describe('with lightningcss', () => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'transition-react'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: true,
          },
        },
      })

      it('should have the correct color on mount after navigation', async () => {
        let browser
        try {
          browser = await next.browser('/')

          // Navigate to other:
          await browser.waitForElementByCss('#link-other').click()
          const text = await browser.waitForElementByCss('#red-title').text()
          expect(text).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })
  })

  describe('Has CSS in computed styles in Production', () => {
    describe('without lightningcss', () => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'multi-page'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: false,
          },
        },
      })

      it('should have CSS for page', async () => {
        const browser = await next.browser('/page2')
        try {
          const currentColor = await browser.eval(
            `window.getComputedStyle(document.querySelector('.blue-text')).color`
          )
          expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
        } finally {
          await browser.close()
        }
      })

      it(`should've preloaded the CSS file and injected it in <head>`, async () => {
        const $ = await next.render$('/page2')

        const cssPreload = $('link[rel="preload"][as="style"]')
        expect(cssPreload.length).toBe(1)
        expect(cssPreload.attr('href')).toMatch(
          /^\/_next\/static\/.*\.css(\?dpl=.*)?$/
        )

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)
        expect(cssSheet.attr('href')).toMatch(
          /^\/_next\/static\/.*\.css(\?dpl=.*)?$/
        )

        /* ensure CSS preloaded first */
        const allPreloads = [].slice.call($('link[rel="preload"]'))
        const styleIndexes = allPreloads.flatMap((p: any, i: number) =>
          p.attribs.as === 'style' ? i : []
        )
        expect(styleIndexes).toEqual([0])
      })
    })

    describe('with lightningcss', () => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'multi-page'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: true,
          },
        },
      })

      it('should have CSS for page', async () => {
        const browser = await next.browser('/page2')
        try {
          const currentColor = await browser.eval(
            `window.getComputedStyle(document.querySelector('.blue-text')).color`
          )
          expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
        } finally {
          await browser.close()
        }
      })

      it(`should've preloaded the CSS file and injected it in <head>`, async () => {
        const $ = await next.render$('/page2')

        const cssPreload = $('link[rel="preload"][as="style"]')
        expect(cssPreload.length).toBe(1)
        expect(cssPreload.attr('href')).toMatch(
          /^\/_next\/static\/.*\.css(\?dpl=.*)?$/
        )

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)
        expect(cssSheet.attr('href')).toMatch(
          /^\/_next\/static\/.*\.css(\?dpl=.*)?$/
        )

        /* ensure CSS preloaded first */
        const allPreloads = [].slice.call($('link[rel="preload"]'))
        const styleIndexes = allPreloads.flatMap((p: any, i: number) =>
          p.attribs.as === 'style' ? i : []
        )
        expect(styleIndexes).toEqual([0])
      })
    })
  })

  describe('Good CSS Import from node_modules', () => {
    describe('without lightningcss', () => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'npm-import'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: false,
          },
        },
        dependencies: {
          nprogress: '0.2.0',
        },
      })

      it(`should've emitted a single CSS file`, async () => {
        const $ = await next.render$('/')

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)

        const stylesheet = cssSheet.attr('href')!

        const cssContent = (
          await next.fetch(stylesheet).then((res) => res.text())
        )
          .replace(/\/\*.*?\*\/\n?/g, '')
          .trim()

        expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim()).toMatch(
          /nprogress/
        )
      })
    })

    describe('with lightningcss', () => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'npm-import'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: true,
          },
        },
        dependencies: {
          nprogress: '0.2.0',
        },
      })

      it(`should've emitted a single CSS file`, async () => {
        const $ = await next.render$('/')

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)

        const stylesheet = cssSheet.attr('href')!

        const cssContent = (
          await next.fetch(stylesheet).then((res) => res.text())
        )
          .replace(/\/\*.*?\*\/\n?/g, '')
          .trim()

        expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim()).toMatch(
          /nprogress/
        )
      })
    })
  })

  describe('Good Nested CSS Import from node_modules', () => {
    describe('without lightningcss', () => {
      const useLightningcss = false
      const { next, isTurbopack } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'npm-import-nested'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: false,
          },
        },
      })

      it(`should've emitted a single CSS file`, async () => {
        const $ = await next.render$('/')

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)

        const stylesheet = cssSheet.attr('href')!

        const cssContent = (
          await next.fetch(stylesheet).then((res) => res.text())
        )
          .replace(/\/\*.*?\*\/\n?/g, '')
          .trim()

        if (isTurbopack && useLightningcss) {
          expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim())
            .toMatchInlineSnapshot(`
                 ".other{color:#00f}
                 .test{color:red}"
                `)
        } else if (isTurbopack && !useLightningcss) {
          expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim())
            .toMatchInlineSnapshot(`
                 ".other{color:#00f}
                 .test{color:red}"
                `)
        } else if (useLightningcss) {
          expect(
            cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim()
          ).toMatchInlineSnapshot(`".other{color:#00f}.test{color:red}"`)
        } else {
          expect(
            cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim()
          ).toMatchInlineSnapshot(`".other{color:blue}.test{color:red}"`)
        }
      })
    })

    describe('with lightningcss', () => {
      const useLightningcss = true
      const { next, isTurbopack } = nextTestSetup({
        files: join(__dirname, 'fixtures', 'npm-import-nested'),
        nextConfig: {
          ...cssFixturesNextConfigBase,
          experimental: {
            useLightningcss: true,
          },
        },
      })

      it(`should've emitted a single CSS file`, async () => {
        const $ = await next.render$('/')

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)

        const stylesheet = cssSheet.attr('href')!

        const cssContent = (
          await next.fetch(stylesheet).then((res) => res.text())
        )
          .replace(/\/\*.*?\*\/\n?/g, '')
          .trim()

        if (isTurbopack && useLightningcss) {
          expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim())
            .toMatchInlineSnapshot(`
                 ".other{color:#00f}
                 .test{color:red}"
                `)
        } else if (isTurbopack && !useLightningcss) {
          expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim())
            .toMatchInlineSnapshot(`
                 ".other{color:#00f}
                 .test{color:red}"
                `)
        } else if (useLightningcss) {
          expect(
            cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim()
          ).toMatchInlineSnapshot(`".other{color:#00f}.test{color:red}"`)
        } else {
          expect(
            cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim()
          ).toMatchInlineSnapshot(`".other{color:blue}.test{color:red}"`)
        }
      })
    })
  })
})

// https://github.com/vercel/next.js/issues/15468
describe('CSS Property Ordering', () => {
  describe('without lightningcss', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'next-issue-15468'),
      nextConfig: {
        ...cssFixturesNextConfigBase,
        experimental: {
          useLightningcss: false,
        },
      },
    })

    it('should have the border width (property ordering)', async () => {
      const browser = await next.browser('/')
      try {
        const width1 = await browser.eval(
          `window.getComputedStyle(document.querySelector('.test1')).borderWidth`
        )
        expect(width1).toMatchInlineSnapshot(`"0px"`)

        const width2 = await browser.eval(
          `window.getComputedStyle(document.querySelector('.test2')).borderWidth`
        )
        expect(width2).toMatchInlineSnapshot(`"5px"`)
      } finally {
        await browser.close()
      }
    })
  })

  describe('with lightningcss', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'next-issue-15468'),
      nextConfig: {
        ...cssFixturesNextConfigBase,
        experimental: {
          useLightningcss: true,
        },
      },
    })

    it('should have the border width (property ordering)', async () => {
      const browser = await next.browser('/')
      try {
        const width1 = await browser.eval(
          `window.getComputedStyle(document.querySelector('.test1')).borderWidth`
        )
        expect(width1).toMatchInlineSnapshot(`"0px"`)

        const width2 = await browser.eval(
          `window.getComputedStyle(document.querySelector('.test2')).borderWidth`
        )
        expect(width2).toMatchInlineSnapshot(`"5px"`)
      } finally {
        await browser.close()
      }
    })
  })
})
