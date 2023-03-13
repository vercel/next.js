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

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".index_redText__WduQk{color:red}"`
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

    expect($('#verify-red').attr('class')).toMatchInlineSnapshot(
      `"index_redText__WduQk"`
    )
  })
})

describe('3rd Party CSS Module Support', () => {
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

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".index_foo__gL0ty{position:relative}.index_foo__gL0ty .bar,.index_foo__gL0ty .baz{height:100%;overflow:hidden}.index_foo__gL0ty .lol,.index_foo__gL0ty>.lel{width:80%}"`
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
      `"index_foo__gL0ty"`
    )
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

describe.skip('Invalid CSS Module Usage in node_modules', () => {
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
    expect(stderr).toMatch(/Location:.*node_modules[\\/]example[\\/]index\.mjs/)
  })
})

describe.skip('Invalid CSS Global Module Usage in node_modules', () => {
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
    expect(stderr).toMatch(/Location:.*node_modules[\\/]example[\\/]index\.mjs/)
  })
})

describe('Valid CSS Module Usage from within node_modules', () => {
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
      `"{\\"message\\":\\"Why hello there\\"} {\\"redText\\":\\"example_redText__8_1ap\\"}"`
    )
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFolder = join(appDir, '.next/static/css')

    const files = await readdir(cssFolder)
    const cssFiles = files.filter((f) => /\.css$/.test(f))

    expect(cssFiles.length).toBe(1)
    const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".example_redText__8_1ap{color:red}"`
    )
  })
})

describe('Valid Nested CSS Module Usage from within node_modules', () => {
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
      `"{\\"message\\":\\"Why hello there\\"} {\\"other2\\":\\"example_other2__pD1TP\\",\\"subClass\\":\\"example_subClass___Qywg other_className__jR2X2\\"}"`
    )
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFolder = join(appDir, '.next/static/css')

    const files = await readdir(cssFolder)
    const cssFiles = files.filter((f) => /\.css$/.test(f))

    expect(cssFiles.length).toBe(1)
    const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".other_other3__QRKUk{color:violet}.other_className__jR2X2{background:red;color:#ff0}.example_other2__pD1TP{color:red}.example_subClass___Qywg{background:blue}"`
    )
  })
})

describe('CSS Module Composes Usage (Basic)', () => {
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

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".index_className__phGSl{background:red;color:#ff0}.index_subClass__fPp6w{background:blue}"`
    )
  })
})

describe('CSS Module Composes Usage (External)', () => {
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

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".other_className__e_JDW{background:red;color:#ff0}.index_subClass__fPp6w{background:blue}"`
    )
  })
})

describe('Dynamic Route CSS Module Usage', () => {
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

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `"._post__home__a9vTy{background:red}"`
    )
  })

  it('should apply styles correctly', async () => {
    const browser = await webdriver(appPort, '/post-1')

    const background = await browser
      .elementByCss('#my-div')
      .getComputedCss('background-color')

    expect(background).toMatch(/rgb(a|)\(255, 0, 0/)
  })
})

describe('Catch-all Route CSS Module Usage', () => {
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

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".___post__home__w1yuY{background:red}"`
    )
  })
})
