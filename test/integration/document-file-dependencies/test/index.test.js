/* eslint-env jest */

import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import cheerio from 'cheerio'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')

let appPort
let app

describe('File Dependencies', () => {
  describe('production mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      await nextBuild(appDir)
      app = await nextStart(appDir, appPort)
    })

    afterAll(() => killApp(app))

    it('should depend on global and module css files in standard page', async () => {
      const res = await fetchViaHTTP(appPort, '/')
      const $ = cheerio.load(await res.text())
      const cssFiles = $('link[rel="stylesheet"]')
      expect(cssFiles.length).toBe(2)
    })

    it('should depend on global and module css files in 404 page', async () => {
      const res = await fetchViaHTTP(appPort, '/__not_found__')
      const $ = cheerio.load(await res.text())
      const cssFiles = $('link[rel="stylesheet"]')
      expect(cssFiles.length).toBe(2)
    })

    it('should depend on global and module css files in _error page', async () => {
      const res = await fetchViaHTTP(appPort, '/error-trigger')
      const $ = cheerio.load(await res.text())
      const cssFiles = $('link[rel="stylesheet"]')
      expect(cssFiles.length).toBe(2)
    })
  })
})
