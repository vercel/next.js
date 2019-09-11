/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { readdir, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const fixturesDir = join(__dirname, '..', 'fixtures')

describe('CSS Support', () => {
  describe('Basic Global Support', () => {
    const appDir = join(fixturesDir, 'single-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8')).toContain(
        'color:red'
      )
    })
  })

  describe('Multi Global Support', () => {
    const appDir = join(fixturesDir, 'multi-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    // TODO: Currently broken, how do we want this to work?
    // Single CSS file or two CSS files?
    it.skip(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(cssContent).toContain('color:red')
      expect(cssContent).toContain('color:blue')
    })
  })

  describe('Invalid Global CSS', () => {
    const appDir = join(fixturesDir, 'invalid-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true
      })
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.css')
      expect(stderr).toContain('no loaders are configured to process this file')
    })
  })

  describe('Invalid Global CSS with Custom App', () => {
    const appDir = join(fixturesDir, 'invalid-global-with-app')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true
      })
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.css')
      expect(stderr).toContain('no loaders are configured to process this file')
    })
  })

  describe('Valid and Invalid Global CSS with Custom App', () => {
    const appDir = join(fixturesDir, 'valid-and-invalid-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true
      })
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.css')
      expect(stderr).toContain('no loaders are configured to process this file')
    })
  })

  // TODO: test style HMR in dev with single & multi-sheets
  // TODO: test @import and url() behavior within CSS files
  // TODO: test polyfilling behavior
  // TODO: test prefixing behavior
  // TODO: test server-side response inclusion of CSS scripts
  // TODO: test client-side hydration CSS validity for single & multi
  // TODO: test client-side transitions between pages
})
