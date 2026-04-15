import fs from 'fs/promises'
import { join } from 'path'
import { nextTestSetup, isNextStart } from 'e2e-utils'

describe('externals-pages-bundle', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (!isNextStart) {
    it('skip for non-production mode', () => {})
    return
  }

  beforeAll(async () => {
    await next.build()
  })

  it('should have no externals with the config set', async () => {
    if (process.env.IS_TURBOPACK_TEST) {
      const ssrPath = join(next.testDir, '.next/server/chunks/ssr')
      const pageBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
        p.match(/\.js$/)
      )
      expect(pageBundleBasenames).not.toBeEmpty()
      let allBundles = ''
      for (const basename of pageBundleBasenames) {
        const output = await fs.readFile(join(ssrPath, basename), 'utf8')
        allBundles += output
      }

      expect(allBundles).toContain('"external-package content"')
    } else {
      const output = await fs.readFile(
        join(next.testDir, '.next/server/pages/index.js'),
        'utf8'
      )
      expect(output).not.toContain('require("external-package")')
    }
  })

  it('should respect the serverExternalPackages config', async () => {
    if (process.env.IS_TURBOPACK_TEST) {
      const ssrPath = join(next.testDir, '.next/server/chunks/ssr')
      const pageBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
        p.match(/\.js$/)
      )
      expect(pageBundleBasenames).not.toBeEmpty()
      let allBundles = ''
      for (const basename of pageBundleBasenames) {
        const output = await fs.readFile(join(ssrPath, basename), 'utf8')
        allBundles += output
      }

      expect(allBundles).not.toContain('"opted-out-external-package content"')
    } else {
      const output = await fs.readFile(
        join(next.testDir, '.next/server/pages/index.js'),
        'utf8'
      )
      expect(output).toContain('require("opted-out-external-package")')
    }
  })
})
