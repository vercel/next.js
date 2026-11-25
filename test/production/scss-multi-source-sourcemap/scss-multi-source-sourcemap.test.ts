/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

describe('SCSS Multi-Source Sourcemap', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { sass: '1.54.0' },
    nextConfig: {
      productionBrowserSourceMaps: true,
    },
  })

  it('emits a sourcemap whose mappings reference each combined source', async () => {
    const $ = await next.render$('/')

    const cssSheet = $('link[rel="stylesheet"]')
    expect(cssSheet.length).toBe(1)

    const stylesheetUrl = cssSheet.attr('href')
    const cssContent = await next.fetch(stylesheetUrl).then((res) => res.text())

    // Sanity-check both rules are emitted into a single bundle.
    const cssContentWithoutSourceMap = cssContent
      .replace(/\/\*.*?\*\//g, '')
      .trim()
    expect(cssContentWithoutSourceMap).toContain('.from-partial')
    expect(cssContentWithoutSourceMap).toContain('.from-main')

    // Contains a source map.
    expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)

    const sourceMapUrl = /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//.exec(
      cssContent
    )[1]
    const actualSourceMapUrl = stylesheetUrl.replace(
      /(?<=^|\/)[^/?]+(?=$|\?)/,
      sourceMapUrl
    )
    const sourceMapContent = await next
      .fetch(actualSourceMapUrl)
      .then((res) => res.text())
    const sourceMapContentParsed = JSON.parse(sourceMapContent)

    // With multiple inputs combined via `@import`, both source files must
    // be declared as sources and their content preserved.
    expect(sourceMapContentParsed.sources).toEqual(
      expect.arrayContaining([
        expect.stringContaining('global.scss'),
        expect.stringContaining('_partial.scss'),
      ])
    )
    expect(sourceMapContentParsed.sourcesContent).toEqual(
      expect.arrayContaining([
        expect.stringContaining('.from-partial'),
        expect.stringContaining('.from-main'),
      ])
    )

    // Ensure it doesn't have a specific path in the snapshot.
    delete sourceMapContentParsed.file
    delete sourceMapContentParsed.sources

    if (process.env.IS_TURBOPACK_TEST) {
      expect(sourceMapContentParsed).toMatchInlineSnapshot(`
       {
         "mappings": "AAAA,wBCEA",
         "names": [],
         "sourcesContent": [
           ".from-partial {
         color: red;
       }
       ",
           "@import './partial';

       .from-main {
         color: blue;
       }
       ",
         ],
         "version": 3,
       }
      `)
    } else if (process.env.NEXT_RSPACK) {
      expect(sourceMapContentParsed).toMatchInlineSnapshot(`
       {
         "mappings": "AAAA,cACE,SAAA,CCCF,WACE,UAAA",
         "names": [],
         "sourcesContent": [
           ".from-partial {
         color: red;
       }
       ",
           "@import './partial';

       .from-main {
         color: blue;
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
         "mappings": "AAAA,cACE,SAAA,CCCF,WACE,UAAA",
         "names": [],
         "sourceRoot": "",
         "sourcesContent": [
           ".from-partial {
         color: red;
       }
       ",
           "@import './partial';

       .from-main {
         color: blue;
       }
       ",
         ],
         "version": 3,
       }
      `)
    }
  })
})
