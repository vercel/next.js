import fs from 'fs/promises'
import { join } from 'path'
import { nextTestSetup, isNextStart, isNextDev } from 'e2e-utils'

describe('externals-pages-bundle', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  describe('bundle pages externals with config.bundlePagesRouterDependencies', () => {
    if (!isNextStart) {
      it('skip for non-production mode', () => {})
      return
    }

    beforeAll(async () => {
      await next.build()
    })

    it('should have no externals with the config set', async () => {
      if (isTurbopack) {
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
        const output = await next.readFile('.next/server/pages/index.js')
        expect(output).not.toContain('require("external-package")')
      }
    })

    it('should respect the serverExternalPackages config', async () => {
      if (isTurbopack) {
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
        const output = await next.readFile('.next/server/pages/index.js')
        expect(output).toContain('require("opted-out-external-package")')
      }
    })
  })

  describe('default externals (dev mode)', () => {
    if (!isNextDev) {
      it('skip for non-dev mode', () => {})
      return
    }

    beforeAll(async () => {
      await next.deleteFile('next.config.js')
      await next.start()
    })

    it('should use externals for unvendored node_modules reachable from the project', async () => {
      await next.render('/')
      if (isTurbopack) {
        const ssrPath = join(next.testDir, `${next.distDir}/server/chunks/ssr`)
        const pageBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
          p.match(/\.js$/)
        )
        expect(pageBundleBasenames).not.toBeEmpty()
        let allBundles = ''
        for (const basename of pageBundleBasenames) {
          const output = await fs.readFile(join(ssrPath, basename), 'utf8')
          allBundles += output
        }

        expect(allBundles).toMatch(/"external-package(-[0-9a-f]+)?"/)
        expect(allBundles).not.toContain('"external-package content"')
      } else {
        const output = await next.readFile(
          `${next.distDir}/server/pages/index.js`
        )
        expect(output).toContain('require("external-package")')
      }
    })
  })
})
