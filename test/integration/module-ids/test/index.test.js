/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextBuild,
  renderViaHTTP,
  getDistDir,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const originalIsNextDev = global.isNextDev
let appPort
let app

describe('minified module ids', () => {
  ;(!process.env.IS_TURBOPACK_TEST || process.env.TURBOPACK_DEV
    ? describe.skip
    : describe)('production mode', () => {
    let ssrBundles = ''
    let staticBundles = ''

    beforeAll(async () => {
      // getDistDir depends on global.isNextDev
      global.isNextDev = false
      await nextBuild(appDir, [])

      const ssrPath = join(appDir, `${getDistDir()}/server/chunks/ssr/`)
      const ssrBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
        p.match(/\.js$/)
      )
      for (const basename of ssrBundleBasenames) {
        const output = await fs.readFile(join(ssrPath, basename), 'utf8')
        ssrBundles += output
      }

      const staticPath = join(appDir, `${getDistDir()}/static/chunks/`)
      const staticBundleBasenames = (await fs.readdir(staticPath)).filter((p) =>
        p.match(/\.js$/)
      )
      for (const basename of staticBundleBasenames) {
        const output = await fs.readFile(join(staticPath, basename), 'utf8')
        staticBundles += output
      }
    })
    afterAll(() => {
      global.isNextDev = originalIsNextDev
    })

    it('should have no long module ids for basic modules', async () => {
      expect(ssrBundles).not.toContain('module-with-long-name')
      expect(ssrBundles).toContain('the content of a module with a long name')
    })

    it('should have no long module ids for external modules', async () => {
      expect(ssrBundles).not.toContain('external-module-with-long-name')
      expect(ssrBundles).toContain(
        'the content of an external module with a long name'
      )
    })

    it('should have no long module ids for async loader modules', async () => {
      expect(ssrBundles).not.toContain('CustomComponent.tsx')
      expect(ssrBundles).toContain('the content of a dynamic component')
    })

    it('should have no long module id for the next client runtime module', async () => {
      expect(staticBundles).not.toContain('next/dist/client/next-turbopack')
    })
  })
  ;(!process.env.IS_TURBOPACK_TEST || process.env.TURBOPACK_BUILD
    ? describe.skip
    : describe)('development mode', () => {
    let ssrBundles = ''
    let staticBundles = ''

    beforeAll(async () => {
      // getDistDir depends on global.isNextDev
      global.isNextDev = true
      appPort = await findPort()
      app = await launchApp(appDir, appPort)

      await renderViaHTTP(appPort, '/')

      const ssrPath = join(appDir, `${getDistDir()}/server/chunks/ssr/`)
      const ssrBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
        p.match(/\.js$/)
      )
      for (const basename of ssrBundleBasenames) {
        const output = await fs.readFile(join(ssrPath, basename), 'utf8')
        ssrBundles += output
      }

      const staticPath = join(appDir, `${getDistDir()}/static/chunks/`)
      const staticBundleBasenames = (await fs.readdir(staticPath)).filter((p) =>
        p.match(/\.js$/)
      )
      for (const basename of staticBundleBasenames) {
        const output = await fs.readFile(join(staticPath, basename), 'utf8')
        staticBundles += output
      }
    })
    afterAll(() => {
      global.isNextDev = originalIsNextDev
      killApp(app)
    })

    it('should have long module ids for basic modules', async () => {
      expect(ssrBundles).toContain('module-with-long-name')
      expect(ssrBundles).toContain('the content of a module with a long name')
    })

    it('should have long module ids for external modules', async () => {
      expect(ssrBundles).toContain('external-module-with-long-name')
      expect(ssrBundles).toContain(
        'the content of an external module with a long name'
      )
    })

    it('should have long module ids for async loader modules', async () => {
      expect(ssrBundles).toContain('CustomComponent.tsx')
      expect(ssrBundles).toContain('the content of a dynamic component')
    })

    it('should have long module id for the next client runtime module', async () => {
      expect(staticBundles).toContain('next/dist/client/next-dev-turbopack')
    })
  })
})
