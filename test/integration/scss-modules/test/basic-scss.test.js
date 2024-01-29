/* eslint-env jest */

import cheerio from 'cheerio'
import { readdir, readFile, remove } from 'fs-extra'
import {
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../../scss-fixtures')

describe('Basic SCSS Module Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'basic-module')

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

describe('3rd Party CSS Module Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, '3rd-party-module')

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
      ).toMatchInlineSnapshot(
        `".index_foo__72b4D{position:relative}.index_foo__72b4D .bar,.index_foo__72b4D .baz{height:100%;overflow:hidden}.index_foo__72b4D .lol,.index_foo__72b4D>.lel{width:80%}"`
      )
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

      expect($('#verify-div').attr('class')).toMatchInlineSnapshot(
        `"index_foo__72b4D"`
      )
    })
  })
})

describe('Has CSS Module in computed styles in Development', () => {
  const appDir = join(fixturesDir, 'dev-module')

  let appPort
  let app
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should have CSS for page', async () => {
    const browser = await webdriver(appPort, '/')

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#verify-red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  })
})

describe('Has CSS Module in computed styles in Production', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'prod-module')

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

    it('should have CSS for page', async () => {
      const browser = await webdriver(appPort, '/')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
    })
  })
})

describe('Can hot reload CSS Module without losing state', () => {
  const appDir = join(fixturesDir, 'hmr-module')

  let appPort
  let app
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should update CSS color without remounting <input>', async () => {
    const browser = await webdriver(appPort, '/')

    const desiredText = 'hello world'
    await browser.elementById('text-input').type(desiredText)
    expect(await browser.elementById('text-input').getValue()).toBe(desiredText)

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#verify-red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

    const cssFile = new File(join(appDir, 'pages/index.module.scss'))
    try {
      cssFile.replace('$var: red', '$var: purple')
      await waitFor(2000) // wait for HMR

      const refreshedColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(refreshedColor).toMatchInlineSnapshot(`"rgb(128, 0, 128)"`)

      // ensure text remained
      expect(await browser.elementById('text-input').getValue()).toBe(
        desiredText
      )
    } finally {
      cssFile.restore()
    }
  })
})

describe('CSS Module Composes Usage (Basic)', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    // This is a very bad feature. Do not use it.
    const appDir = join(fixturesDir, 'composes-basic')

    let stdout
    let code
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
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

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(
        `".index_className__OLWEh{background:red;color:#ff0}.index_subClass__Z_IFg{background:blue}"`
      )
    })
  })
})

describe('CSS Module Composes Usage (External)', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    // This is a very bad feature. Do not use it.
    const appDir = join(fixturesDir, 'composes-external')

    let stdout
    let code
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
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

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(
        `".other_className__A8aN2{background:red;color:#ff0}.index_subClass__Z_IFg{background:blue}"`
      )
    })
  })
})
