/* eslint-env jest */

import fs from 'fs/promises'
import { join } from 'path'
import {
  killApp,
  launchApp,
  findPort,
  File,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('default', () => {
  it('should use externals for unvendored node_modules reachable from the project', async () => {
    const port = await findPort()
    const config = new File(join(appDir, 'next.config.js'))
    config.delete()
    try {
      const app = await launchApp(appDir, port)
      await renderViaHTTP(port, '/')
      if (process.env.TURBOPACK) {
        const ssrPath = join(appDir, '.next/server/chunks')
        const pageBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
          p.match(/\.js$/)
        )
        expect(pageBundleBasenames).not.toBeEmpty()
        let allBundles = ''
        for (const basename of pageBundleBasenames) {
          const output = await fs.readFile(join(ssrPath, basename), 'utf8')
          allBundles += output
        }
        expect(allBundles).toContain(
          '__turbopack_external_require__("external-package", true)'
        )
      } else {
        const output = await fs.readFile(
          join(appDir, '.next/server/pages/index.js'),
          'utf8'
        )
        expect(output).toContain('require("external-package")')
      }
      await killApp(app)
    } finally {
      config.restore()
    }
  })
})
