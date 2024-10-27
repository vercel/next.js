/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('bundle pages externals with config.bundlePagesRouterDependencies', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir, [])
      })

      it('should have no externals with the config set', async () => {
        if (process.env.TURBOPACK) {
          const ssrPath = join(appDir, '.next/server/chunks/ssr')
          const pageBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
            p.match(/\.js$/)
          )
          expect(pageBundleBasenames).not.toBeEmpty()
          let allBundles = ''
          for (const basename of pageBundleBasenames) {
            const output = await fs.readFile(join(ssrPath, basename), 'utf8')
            allBundles += output
          }

          // we don't know the name of the minified `__turbopack_external_require__`, so we just check the content.
          expect(allBundles).toContain('"external-package content"')
        } else {
          const output = await fs.readFile(
            join(appDir, '.next/server/pages/index.js'),
            'utf8'
          )
          expect(output).not.toContain('require("external-package")')
        }
      })

      it('should respect the serverExternalPackages config', async () => {
        if (process.env.TURBOPACK) {
          const ssrPath = join(appDir, '.next/server/chunks/ssr')
          const pageBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
            p.match(/\.js$/)
          )
          expect(pageBundleBasenames).not.toBeEmpty()
          let allBundles = ''
          for (const basename of pageBundleBasenames) {
            const output = await fs.readFile(join(ssrPath, basename), 'utf8')
            allBundles += output
          }

          // we don't know the name of the minified `__turbopack_external_require__`, so we just check the content.
          expect(allBundles).not.toContain(
            '"opted-out-external-package content"'
          )
        } else {
          const output = await fs.readFile(
            join(appDir, '.next/server/pages/index.js'),
            'utf8'
          )
          expect(output).toContain('require("opted-out-external-package")')
        }
      })
    }
  )
})
