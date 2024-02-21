/* eslint-env jest */

import { readdir, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

describe('SCSS Support loader handling', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('Data Urls', () => {
      const appDir = __dirname

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should compile successfully', async () => {
        const { code, stdout } = await nextBuild(appDir, [], {
          stdout: true,
        })
        // eslint-disable-next-line
        expect(code).toBe(0)
        // eslint-disable-next-line
        expect(stdout).toMatch(/Compiled successfully/)
      })

      it(`should've emitted expected files`, async () => {
        const cssFolder = join(appDir, '.next/static/css')

        const files = await readdir(cssFolder)
        const cssFiles = files.filter((f) => /\.css$/.test(f))

        expect(cssFiles.length).toBe(1)
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
          /^\.red-text\{color:red;background-image:url\("data:[^"]+"\)\}$/
        )
      })
    })
  })
})
