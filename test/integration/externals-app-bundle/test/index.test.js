/* eslint-env jest */

import fs from 'fs/promises'
import { join } from 'path'
import {
  killApp,
  launchApp,
  findPort,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('app bundle externals ', () => {
  describe('dev mode', () => {
    it('should have externals for those in config.experimental.serverComponentsExternalPackages', async () => {
      const port = await findPort()
      const app = await launchApp(appDir, port)
      await renderViaHTTP(port, '/')
      await waitFor(1000)
      if (process.env.TURBOPACK) {
        const appBundles = await getAppPageChunkPaths(appDir)
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
          join(appDir, '.next/server/app/page.js'),
          'utf8'
        )
        expect(output).toContain('require("external-package")')
      }
      await killApp(app)
    })

    it('uses externals for predefined list in server-external-packages.json', async () => {
      const port = await findPort()
      const app = await launchApp(appDir, port)
      await renderViaHTTP(port, '/predefined')
      await waitFor(1000)
      if (process.env.TURBOPACK) {
        const appBundles = await getAppPageChunkPaths(appDir, 'predefined')
        console.log({ appBundles })
        const bundleTexts = await Promise.all(
          appBundles.map((b) => fs.readFile(b, 'utf8'))
        )
        console.log({ bundleTexts })
        expect(
          bundleTexts.find((t) =>
            t.includes('__turbopack_external_require__("sqlite3", true)')
          )
        ).not.toBeUndefined()
      } else {
        const output = await fs.readFile(
          join(appDir, '.next/server/app/predefined/page.js'),
          'utf8'
        )
        expect(output).toContain('require("sqlite3")')
      }
      await killApp(app)
    })
  })
})

async function getAppPageChunkPaths(appDir, pageName) {
  const rscPath = join(appDir, '.next/server/chunks/rsc')
  const pageRegex = new RegExp(
    `app${pageName ? '_' + pageName : ''}_page_[0-9a-f]+\.js$`
  )

  console.log({ pageRegex })

  return (await fs.readdir(rscPath))
    .filter((p) => p.match(pageRegex))
    .map((basename) => join(rscPath, basename))
}
