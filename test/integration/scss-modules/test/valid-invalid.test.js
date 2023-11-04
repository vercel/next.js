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

const fixturesDir = join(__dirname, '../../scss-fixtures')

describe.skip('Invalid CSS Module Usage in node_modules', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'invalid-module')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(code).not.toBe(0)
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('node_modules/example/index.module.scss')
      expect(stderr).toMatch(
        /CSS Modules.*cannot.*be imported from within.*node_modules/
      )
      expect(stderr).toMatch(
        /Location:.*node_modules[\\/]example[\\/]index\.mjs/
      )
    })
  })
})

describe.skip('Invalid CSS Global Module Usage in node_modules', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'invalid-global-module')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(code).not.toBe(0)
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('node_modules/example/index.scss')
      expect(stderr).toMatch(
        /Global CSS.*cannot.*be imported from within.*node_modules/
      )
      expect(stderr).toMatch(
        /Location:.*node_modules[\\/]example[\\/]index\.mjs/
      )
    })
  })
})

describe('Valid CSS Module Usage from within node_modules', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'nm-module')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

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

    it(`should've prerendered with relevant data`, async () => {
      const content = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(content)

      const cssPreload = $('#nm-div')
      expect(cssPreload.text()).toMatchInlineSnapshot(
        `"{"message":"Why hello there"} {"redText":"example_redText__jsP_3"}"`
      )
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".example_redText__jsP_3{color:red}"`)
    })
  })
})

describe('Valid Nested CSS Module Usage from within node_modules', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'nm-module-nested')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

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

    it(`should've prerendered with relevant data`, async () => {
      const content = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(content)

      const cssPreload = $('#nm-div')
      expect(cssPreload.text()).toMatchInlineSnapshot(
        `"{"message":"Why hello there"} {"other2":"example_other2__HNcoQ","subClass":"example_subClass__SxkPt other_className___l2o_"}"`
      )
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(
        `".other_other3__DvhyB{color:violet}.other_className___l2o_{background:red;color:#ff0}.example_other2__HNcoQ{color:red}.example_subClass__SxkPt{background:blue}"`
      )
    })
  })
})
