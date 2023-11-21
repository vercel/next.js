/* eslint-env jest */

import { join } from 'path'
import fsp from 'fs/promises'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')

function runTests() {
  describe('first-line hashbang (#!) parse', () => {
    it('should work for .js files', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch('JS: 123')
    })

    it('should work for .mjs files', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch('MJS: 456')
    })

    it('should work for .cjs files', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch('CJS: 789')
    })
  })
}

const nextConfig = join(appDir, 'next.config.js')

describe('Hashbang', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests(true)
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await fsp.rm(nextConfig, { recursive: true, force: true })
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
