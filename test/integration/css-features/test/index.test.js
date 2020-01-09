/* eslint-env jest */
/* global jasmine */
import { readdir, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const fixturesDir = join(__dirname, '../fixtures')

describe('Browserslist: Old', () => {
  const appDir = join(fixturesDir, 'browsers-old')

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
      `"a{-webkit-animation:none 0s ease 0s 1 normal none running;animation:none 0s ease 0s 1 normal none running;-webkit-backface-visibility:visible;backface-visibility:visible;background:transparent none repeat 0 0/auto auto padding-box border-box scroll;border:none;border-collapse:separate;-webkit-border-image:none;border-image:none;-webkit-border-radius:0;border-radius:0;border-spacing:0;bottom:auto;-webkit-box-shadow:none;box-shadow:none;-webkit-box-sizing:content-box;box-sizing:content-box;caption-side:top;clear:none;clip:auto;color:#000;-webkit-columns:auto;-webkit-column-count:auto;-webkit-column-fill:balance;column-fill:balance;grid-column-gap:normal;-webkit-column-gap:normal;column-gap:normal;-webkit-column-rule:medium none currentColor;column-rule:medium none currentColor;-webkit-column-span:1;column-span:1;-webkit-column-width:auto;columns:auto;content:normal;counter-increment:none;counter-reset:none;cursor:auto;direction:ltr;display:inline;empty-cells:show;float:none;font-family:serif;font-size:medium;font-style:normal;-webkit-font-feature-settings:normal;font-feature-settings:normal;font-variant:normal;font-weight:400;font-stretch:normal;line-height:normal;height:auto;-ms-hyphens:none;hyphens:none;left:auto;letter-spacing:normal;list-style:disc outside none;margin:0;max-height:none;max-width:none;min-height:0;min-width:0;opacity:1;orphans:2;outline:medium none invert;overflow:visible;overflow-x:visible;overflow-y:visible;padding:0;page-break-after:auto;page-break-before:auto;page-break-inside:auto;-webkit-perspective:none;perspective:none;-webkit-perspective-origin:50% 50%;perspective-origin:50% 50%;position:static;right:auto;tab-size:8;table-layout:auto;text-align:left;text-align-last:auto;text-decoration:none;text-indent:0;text-shadow:none;text-transform:none;top:auto;-webkit-transform:none;transform:none;-webkit-transform-origin:50% 50% 0;transform-origin:50% 50% 0;-webkit-transform-style:flat;transform-style:flat;-webkit-transition:none 0s ease 0s;transition:none 0s ease 0s;unicode-bidi:normal;vertical-align:baseline;visibility:visible;white-space:normal;widows:2;width:auto;word-spacing:normal;z-index:auto;all:initial}@media (-webkit-min-device-pixel-ratio:2),(min-resolution:2dppx){.image{background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}}"`
    )
  })
})

describe('Browserslist: New', () => {
  const appDir = join(fixturesDir, 'browsers-new')

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
      `"a{all:initial}@media (min-resolution:2dppx){.image{background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}}"`
    )
  })
})

describe('Custom Properties: Pass-Through IE11', () => {
  const appDir = join(fixturesDir, 'cp-ie-11')

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
      `":root{--color:red}h1{color:var(--color)}"`
    )
  })
})

describe('Custom Properties: Pass-Through Modern', () => {
  const appDir = join(fixturesDir, 'cp-modern')

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
      `":root{--color:red}h1{color:var(--color)}"`
    )
  })
})

describe('Custom Properties: Fail for :root {} in CSS Modules', () => {
  const appDir = join(fixturesDir, 'cp-global-modules')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  it('should fail to build', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('pages/styles.module.css')
    expect(stderr).toContain('CssSyntax error: Selector ":root" is not pure')
  })
})

describe('Custom Properties: Fail for global element in CSS Modules', () => {
  const appDir = join(fixturesDir, 'cp-el-modules')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  it('should fail to build', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('pages/styles.module.css')
    expect(stderr).toContain('CssSyntax error: Selector "h1" is not pure')
  })
})

describe('CSS Modules: Import Global CSS', () => {
  const appDir = join(fixturesDir, 'module-import-global')

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
      `"a .styles_foo__31qlD{all:initial}"`
    )
  })
})

describe('CSS Modules: Importing Invalid Global CSS', () => {
  const appDir = join(fixturesDir, 'module-import-global-invalid')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  it('should fail to build', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('pages/styles.module.css')
    expect(stderr).toContain('CssSyntax error: Selector "a" is not pure')
  })
})
