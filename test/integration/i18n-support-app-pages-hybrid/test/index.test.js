import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  fetchViaHTTP,
  File,
  launchApp,
} from 'next-test-utils'

const pageRoutes = ['/', '/en', '/id', '/random', '/en/modnar', '/id/anything']

const appRoutes = ['/another', '/blog', '/blog/random', '/blog/en', '/blog/id']

const runTests = () => {
  it('should handle route in app dir without locale', async () => {
    for (const route of appRoutes) {
      const res = await fetchViaHTTP(appPort, route)
      const $ = cheerio.load(await res.text())
      expect($('#content').text()).toStrictEqual(
        expect.stringContaining('App dir')
      )
    }
  })

  it('should handle route in pages dir with locale', async () => {
    for (const route of pageRoutes) {
      const res = await fetchViaHTTP(appPort, route)
      const $ = cheerio.load(await res.text())
      expect($('#content').text()).toStrictEqual(
        expect.stringContaining('Pages dir')
      )
    }
  })
}

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))

let appPort
let app

describe('i18n Support app/pages hybrid', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })

    runTests()
  })
})
