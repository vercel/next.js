/* eslint-env jest */

import { readdir, readFile, remove } from 'fs-extra'
import { findPort, killApp, nextBuild, nextStart } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../../scss-fixtures')

describe('Dynamic Route CSS Module Usage', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'dynamic-route-module')

    let stdout
    let code
    let app
    let appPort

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
      ;({ code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

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
      ).toMatchInlineSnapshot(`"._post__home__ZI5mq{background:red}"`)
    })

    it('should apply styles correctly', async () => {
      const browser = await webdriver(appPort, '/post-1')

      const background = await browser
        .elementByCss('#my-div')
        .getComputedCss('background-color')

      expect(background).toMatch(/rgb(a|)\(255, 0, 0/)
    })
  })
})

describe('Catch-all Route CSS Module Usage', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'catch-all-module')

    let stdout
    let code
    let app
    let appPort

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
      ;({ code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should have compiled successfully', () => {
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it('should apply styles correctly', async () => {
      const browser = await webdriver(appPort, '/post-1')

      const background = await browser
        .elementByCss('#my-div')
        .getComputedCss('background-color')

      expect(background).toMatch(/rgb(a|)\(255, 0, 0/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".___post__home__bZNj1{background:red}"`)
    })
  })
})
