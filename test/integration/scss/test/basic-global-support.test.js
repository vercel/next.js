/* eslint-env jest */

import { readdir, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'scss-fixtures')

describe('Basic Global Support scss', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'single-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8')).toContain(
        'color:red'
      )
    })
  })
})

describe('Basic Module Include Paths Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'basic-module-include-paths')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8')).toContain(
        'color:red'
      )
    })
  })
})

describe('Basic Module Prepend Data Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'basic-module-prepend-data')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8')).toContain(
        'color:red'
      )
    })
  })
})

describe('Basic Global Support with src/ dir', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'single-global-src')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8')).toContain(
        'color:red'
      )
    })
  })
})

describe('Multi Global Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'multi-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
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
      ).toMatchInlineSnapshot(`".red-text{color:red}.blue-text{color:blue}"`)
    })
  })
})

describe('Nested @import() Global Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'nested-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
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
        `".red-text{color:purple;font-weight:bolder;color:red}.blue-text{color:orange;font-weight:bolder;color:blue}"`
      )
    })
  })
})

// Tests css ordering
describe('Multi Global Support (reversed)', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'multi-global-reversed')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
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
      ).toMatchInlineSnapshot(`".blue-text{color:blue}.red-text{color:red}"`)
    })
  })
})

describe('Good CSS Import from node_modules', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'npm-import')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(/nprogress/)
    })
  })
})

describe('Good Nested CSS Import from node_modules', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'npm-import-nested')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
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
      ).toMatchInlineSnapshot(`".other{color:blue}.test{color:red}"`)
    })
  })
})

describe('CSS Import from node_modules', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'npm-import-bad')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(code).toBe(0)
      expect(stderr).not.toMatch(/Can't resolve '[^']*?nprogress[^']*?'/)
      expect(stderr).not.toMatch(/Build error occurred/)
    })
  })
})
