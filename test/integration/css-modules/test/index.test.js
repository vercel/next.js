/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { remove, readFile, readdir } from 'fs-extra'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  launchApp,
  waitFor,
  renderViaHTTP,
} from 'next-test-utils'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const fixturesDir = join(__dirname, '../../css-fixtures')

describe('Basic CSS Module Support', () => {
  const appDir = join(fixturesDir, 'basic-module')

  let appPort
  let app
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFolder = join(appDir, '.next/static/css')

    const files = await readdir(cssFolder)
    const cssFiles = files.filter(f => /\.css$/.test(f))

    expect(cssFiles.length).toBe(1)
    const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".index_redText__3CwEB{color:red}"`
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
      `"index_redText__3CwEB"`
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
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
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

xdescribe('Can hot reload CSS Module without losing state', () => {
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

  // FIXME: this is broken
  it('should update CSS color without remounting <input>', async () => {
    const browser = await webdriver(appPort, '/')
    await waitFor(2000) // ensure application hydrates

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

describe('Invalid CSS Module Usage in node_modules', () => {
  const appDir = join(fixturesDir, 'invalid-module')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  it('should fail to build', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('node_modules/example/index.module.css')
    expect(stderr).toMatch(
      /CSS Modules.*cannot.*be imported from within.*node_modules/
    )
    expect(stderr).toMatch(/Location:.*node_modules[\\/]example[\\/]index\.mjs/)
  })
})

describe('Invalid CSS Module Usage in node_modules', () => {
  const appDir = join(fixturesDir, 'invalid-global-module')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  it('should fail to build', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('node_modules/example/index.css')
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
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it(`should've prerendered with relevant data`, async () => {
    const content = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(content)

    const cssPreload = $('#nm-div')
    expect(cssPreload.text()).toMatchInlineSnapshot(
      `"{\\"message\\":\\"Why hello there\\"} {\\"redText\\":\\"example_redText__1rb5g\\"}"`
    )
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFolder = join(appDir, '.next/static/css')

    const files = await readdir(cssFolder)
    const cssFiles = files.filter(f => /\.css$/.test(f))

    expect(cssFiles.length).toBe(1)
    const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".example_redText__1rb5g{color:\\"red\\"}"`
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
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it(`should've prerendered with relevant data`, async () => {
    const content = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(content)

    const cssPreload = $('#nm-div')
    expect(cssPreload.text()).toMatchInlineSnapshot(
      `"{\\"message\\":\\"Why hello there\\"} {\\"subClass\\":\\"example_subClass__2YUgj other_className__bt_-E\\"}"`
    )
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFolder = join(appDir, '.next/static/css')

    const files = await readdir(cssFolder)
    const cssFiles = files.filter(f => /\.css$/.test(f))

    expect(cssFiles.length).toBe(1)
    const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".other3_other3__1f9h7{color:violet}.other_className__bt_-E{background:red;color:#ff0}.other2_other2__2PUfY{color:red}.example_subClass__2YUgj{background:#00f}"`
    )
  })
})

describe('CSS Module Composes Usage (Basic)', () => {
  // This is a very bad feature. Do not use it.
  const appDir = join(fixturesDir, 'composes-basic')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    await nextBuild(appDir)
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFolder = join(appDir, '.next/static/css')

    const files = await readdir(cssFolder)
    const cssFiles = files.filter(f => /\.css$/.test(f))

    expect(cssFiles.length).toBe(1)
    const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".index_className__3gr_q{background:red;color:#ff0}.index_subClass__FUvW6{background:#00f}"`
    )
  })
})

describe('CSS Module Composes Usage (External)', () => {
  // This is a very bad feature. Do not use it.
  const appDir = join(fixturesDir, 'composes-external')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    await nextBuild(appDir)
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFolder = join(appDir, '.next/static/css')

    const files = await readdir(cssFolder)
    const cssFiles = files.filter(f => /\.css$/.test(f))

    expect(cssFiles.length).toBe(1)
    const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

    expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatchInlineSnapshot(
      `".other_className__21NIP{background:red;color:#ff0}.index_subClass__FUvW6{background:#00f}"`
    )
  })
})
