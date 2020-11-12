import fs from 'fs-extra'
import { join } from 'path'
import { findPort, killApp, launchApp } from 'next-test-utils'
import { appDir, runTests } from './shared'

const ctx = {
  basePath: '',
  isDev: true,
}

describe('i18n Support', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      ctx.appPort = await findPort()
      ctx.app = await launchApp(appDir, ctx.appPort)
    })
    afterAll(() => killApp(ctx.app))

    runTests(ctx)
  })
})
