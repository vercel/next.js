/* eslint-env jest */

import cheerio from 'cheerio'
import { readdir, readFile, remove } from 'fs-extra'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'
import { join } from 'path'

describe('Basic SCSS Module Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = __dirname

    let appPort
    let app
    let stdout
    let code
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
      ;({ code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    it('should have compiled successfully', () => {
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".index_redText__zXafh{color:red}"`)
    })

    it(`should've injected the CSS on server render`, async () => {
      const content = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(content)

      const cssPreload = $('link[rel="preload"][as="style"]')
      expect(cssPreload.length).toBe(1)
      expect(cssPreload.attr('href')).toMatch(/^\/_next\/static\/css\/.*\.css$/)

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      expect(cssSheet.attr('href')).toMatch(/^\/_next\/static\/css\/.*\.css$/)

      expect($('#verify-red').attr('class')).toMatchInlineSnapshot(
        `"index_redText__zXafh"`
      )
    })
  })
})
