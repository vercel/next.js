import fs from 'fs-extra'
import { join } from 'path'
import { findPort, killApp, launchApp } from 'next-test-utils'
import { appDir, runTests, nextConfig } from './shared'

const ctx = {
  basePath: '/docs',
  isDev: true,
}

describe('i18n Support', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      nextConfig.replace('// basePath', 'basePath')
      await fs.remove(join(appDir, '.next'))
      ctx.appPort = await findPort()
      ctx.app = await launchApp(appDir, ctx.appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(ctx.app)
    })

    runTests(ctx)
  })
})
