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

const fixturesDir = join(__dirname, '../../css-fixtures')

describe('Basic CSS Module Support', () => {
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
      expect(stdout).toContain('.css')
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".index_redText__honUV{color:red}"`)
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
        `"index_redText__honUV"`
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
        `".index_foo__6TgnK{position:relative}.index_foo__6TgnK .bar,.index_foo__6TgnK .baz{height:100%;overflow:hidden}.index_foo__6TgnK .lol,.index_foo__6TgnK>.lel{width:80%}"`
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
        `"index_foo__6TgnK"`
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

    const cssFile = new File(join(appDir, 'pages/index.module.css'))
    try {
      cssFile.replace('color: red', 'color: purple')
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
      expect(stderr).toContain('node_modules/example/index.module.css')
      expect(stderr).toMatch(
        /CSS Modules.*cannot.*be imported from within.*node_modules/
      )
      expect(stderr).toMatch(
        /Location:.*node_modules[\\/]example[\\/]index\.mjs/
      )
    })
  })
})

describe.skip('Invalid Global CSS Module Usage in node_modules', () => {
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
      expect(stderr).toContain('node_modules/example/index.css')
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
        `"{"message":"Why hello there"} {"redText":"example_redText__0ctGB"}"`
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
      ).toMatchInlineSnapshot(`".example_redText__0ctGB{color:red}"`)
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
        `"{"message":"Why hello there"} {"subClass":"example_subClass__m6Tyy other_className__OA8dV"}"`
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
        `".other2_other2__dYPgz{color:red}.other3_other3__7hgUE{color:violet}.other_className__OA8dV{background:red;color:#ff0}.example_subClass__m6Tyy{background:blue}"`
      )
    })
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
        `".index_className__jjcZ1{background:red;color:#ff0}.index_subClass__eDzaW{background:blue}"`
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
        `".other_className__eZV4M{background:red;color:#ff0}.index_subClass__eDzaW{background:blue}"`
      )
    })
  })
})

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
      ).toMatchInlineSnapshot(`"._post__home__yRmHz{background:red}"`)
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

      const bg = await browser
        .elementByCss('#my-div')
        .getComputedCss('background-color')
      expect(bg).toMatch(/rgb(a|)\(255, 0, 0/)

      const fg = await browser.elementByCss('#my-div').getComputedCss('color')
      expect(fg).toMatch(/rgb(a|)\(0, 128, 0/)
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
        `".___post__home__e4zfx{background:red}.__55css_home__r8Rnq{color:green}"`
      )
    })
  })
})
