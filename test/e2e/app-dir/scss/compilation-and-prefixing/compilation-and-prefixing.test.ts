/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { readdir, readFile } from 'fs-extra'
import { join } from 'path'

describe('SCSS Support', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })

  // TODO: Figure out this test for dev and Turbopack
  ;(isNextDev ? describe.skip : describe)('Production only', () => {
    describe('CSS Compilation and Prefixing', () => {
      it(`should've compiled and prefixed`, async () => {
        const cssFolder = join(next.testDir, '.next/static/css')

        const files = await readdir(cssFolder)
        const cssFiles = files.filter((f) => /\.css$/.test(f))

        expect(cssFiles.length).toBe(1)
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(
          `".redText ::placeholder{color:red}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}"`
        )

        // Contains a source map
        console.log({ cssContent })
        expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
      })

      it(`should've emitted a source map`, async () => {
        const cssFolder = join(next.testDir, '.next/static/css')

        const files = await readdir(cssFolder)
        const cssMapFiles = files.filter((f) => /\.css\.map$/.test(f))

        expect(cssMapFiles.length).toBe(1)
        const cssMapContent = (
          await readFile(join(cssFolder, cssMapFiles[0]), 'utf8')
        ).trim()

        const { version, mappings, sourcesContent } = JSON.parse(cssMapContent)
        expect({ version, mappings, sourcesContent }).toMatchInlineSnapshot(`
  {
    "mappings": "AAEE,uBACE,SAHE,CAON,cACE,2CAAA",
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
      })
    })
  })
})
