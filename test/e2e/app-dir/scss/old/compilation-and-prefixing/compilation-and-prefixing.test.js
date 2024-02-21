/* eslint-env jest */

import { readdir, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

describe('SCSS Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('CSS Compilation and Prefixing', () => {
      const appDir = __dirname

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
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(
          `".redText ::placeholder{color:red}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}"`
        )

        // Contains a source map
        expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
      })

      it(`should've emitted a source map`, async () => {
        const cssFolder = join(appDir, '.next/static/css')

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
