/* eslint-env jest */

import fsp from 'fs/promises'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const fixturesDir = join(__dirname, '../fixtures')

describe('Custom Properties: Pass-Through IE11', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'cp-ie-11')

    let stdout
    let code
    beforeAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      ;({ code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))
    })

    it('should have compiled successfully', () => {
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await fsp.readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await fsp.readFile(
        join(cssFolder, cssFiles[0]),
        'utf8'
      )

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
    })
  })
})

describe('Custom Properties: Pass-Through Modern', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'cp-modern')

    let stdout
    let code
    beforeAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      ;({ code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))
    })

    it('should have compiled successfully', () => {
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await fsp.readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await fsp.readFile(
        join(cssFolder, cssFiles[0]),
        'utf8'
      )

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
    })
  })
})

describe('Inline Comments: Minify', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'inline-comments')

    let stdout
    let code
    beforeAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      ;({ code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))
    })

    it('should have compiled successfully', () => {
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await fsp.readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await fsp.readFile(
        join(cssFolder, cssFiles[0]),
        'utf8'
      )

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`"*{box-sizing:border-box}"`)
    })
  })
})
