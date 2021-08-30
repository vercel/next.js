/* eslint-env jest */

import { readdir, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 1)

const fixturesDir = join(__dirname, '../fixtures')

describe('Browserslist: Old', () => {
  const appDir = join(fixturesDir, 'browsers-old')

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
      `"a{all:initial}@media (-webkit-min-device-pixel-ratio:2),(min-resolution:2dppx){.image{background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}}"`
    )
  })
})

describe('Browserslist: New', () => {
  const appDir = join(fixturesDir, 'browsers-new')

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
      `"a{all:initial}@media (min-resolution:2dppx){.image{background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==)}}"`
    )
  })
})

describe('Custom Properties: Pass-Through IE11', () => {
  const appDir = join(fixturesDir, 'cp-ie-11')

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
      `":root{--color:red}h1{color:var(--color)}"`
    )
  })
})

describe('Custom Properties: Pass-Through Modern', () => {
  const appDir = join(fixturesDir, 'cp-modern')

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
    const { code, stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('pages/styles.module.css')
    expect(stderr).toContain('Selector ":root" is not pure')
  })
})

describe('Custom Properties: Fail for global element in CSS Modules', () => {
  const appDir = join(fixturesDir, 'cp-el-modules')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  it('should fail to build', async () => {
    const { code, stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('pages/styles.module.css')
    expect(stderr).toContain('Selector "h1" is not pure')
  })
})

describe('CSS Modules: Import Global CSS', () => {
  const appDir = join(fixturesDir, 'module-import-global')

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
    const { code, stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('Failed to compile')
    expect(stderr).toContain('pages/styles.css')
    expect(stderr).toContain('Selector "a" is not pure')
  })
})

describe('CSS Modules: Import Exports', () => {
  const appDir = join(fixturesDir, 'module-import-exports')

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
      `".styles_blk__2ns7r{color:#000}"`
    )
  })
})

describe('Inline Comments: Minify', () => {
  const appDir = join(fixturesDir, 'inline-comments')

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
      `"*{box-sizing:border-box}"`
    )
  })
})
