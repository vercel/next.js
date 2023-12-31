import fs from 'fs/promises'
import path from 'path'
import { createNextDescribe } from 'e2e-utils'

async function getAppPageChunkPaths(appDir: string, pageName?: string) {
  const rscPath = path.join(appDir, '.next/server/chunks/rsc')
  const pageRegex = new RegExp(
    `app${pageName ? '_' + pageName : ''}_page_tsx_[0-9a-f]+._.js$`
  )

  return (await fs.readdir(rscPath))
    .filter((p) => p.match(pageRegex))
    .map((basename) => path.join(rscPath, basename))
}

createNextDescribe(
  'externals-app',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isTurbopack }) => {
    it('should have externals for those in config.experimental.serverComponentsExternalPackages', async () => {
      await next.render$('/')

      if (isTurbopack) {
        const appBundles = await getAppPageChunkPaths(next.testDir)
        const bundleTexts = await Promise.all(
          appBundles.map((b) => fs.readFile(b, 'utf8'))
        )
        expect(
          bundleTexts.find((t) =>
            t.includes(
              '__turbopack_external_require__("external-package", true)'
            )
          )
        ).not.toBeUndefined()
      } else {
        const output = await fs.readFile(
          path.join(next.testDir, '.next/server/app/page.js'),
          'utf8'
        )
        expect(output).toContain('require("external-package")')
      }
    })

    it('uses externals for predefined list in server-external-packages.json', async () => {
      await next.render$('/predefined')

      if (isTurbopack) {
        const appBundles = await getAppPageChunkPaths(
          next.testDir,
          'predefined'
        )
        const bundleTexts = await Promise.all(
          appBundles.map((b) => fs.readFile(b, 'utf8'))
        )
        expect(
          bundleTexts.find((t) =>
            t.includes('__turbopack_external_require__("sqlite3", true)')
          )
        ).not.toBeUndefined()
      } else {
        const output = await fs.readFile(
          path.join(next.testDir, '.next/server/app/predefined/page.js'),
          'utf8'
        )
        expect(output).toContain('require("sqlite3")')
      }
    })
  }
)
