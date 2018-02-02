/* global jasmine, describe, it, expect, beforeAll, afterAll */

import { join } from 'path'
import getPort from 'get-port'
import clone from 'clone'
import {
  initNextServerScript,
  killApp,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const context = {}

describe('Custom Server', () => {
  beforeAll(async () => {
    const scriptPath = join(appDir, 'server.js')
    context.appPort = appPort = await getPort()
    const env = clone(process.env)
    env.PORT = `${appPort}`

    server = await initNextServerScript(scriptPath, /Ready on/, env)
  })
  afterAll(() => killApp(server))

  describe('with dynamic assetPrefix', () => {
    it('should set the assetPrefix dynamically', async () => {
      const normalUsage = await renderViaHTTP(appPort, '/')
      expect(normalUsage).not.toMatch(/cdn\.com\/myapp/)

      const dynamicUsage = await renderViaHTTP(appPort, '/?setAssetPrefix=1')
      expect(dynamicUsage).toMatch(/cdn\.com\/myapp/)
    })

    it('should set the assetPrefix to a given request', async () => {
      for (let lc = 0; lc < 1000; lc++) {
        const [normalUsage, dynamicUsage] = await Promise.all([
          await renderViaHTTP(appPort, '/'),
          await renderViaHTTP(appPort, '/?setAssetPrefix=1')
        ])

        expect(normalUsage).not.toMatch(/cdn\.com\/myapp/)
        expect(dynamicUsage).toMatch(/cdn\.com\/myapp/)
      }
    })
  })
})
