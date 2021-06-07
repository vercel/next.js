/* eslint-env jest */

import http from 'http'
import { join } from 'path'
import cheerio from 'cheerio'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  File,
  fetchViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
const nextConfig = new File(join(appDir, 'next.config.js'))
let server
let externalPort
let appPort
let app

const runTests = () => {
  it('should rewrite correctly', async () => {
    for (const [path, dest] of [
      ['/path-1', '/path-1'],
      ['/en/path-1', '/en/path-1'],
      ['/fr/path-1', '/fr/path-1'],
    ]) {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })

      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect(JSON.parse($('#data').text())).toEqual({
        url: dest,
      })
    }
  })
}

describe('Custom routes i18n incremental adoption', () => {
  beforeAll(async () => {
    externalPort = await findPort()
    server = http.createServer((req, res) => {
      res.statusCode = 200
      res.end(
        `<p id='data'>${JSON.stringify({
          url: req.url,
        })}</p>`
      )
    })
    await new Promise((res, rej) => {
      server.listen(externalPort, (err) => (err ? rej(err) : res()))
    })
    nextConfig.replace(/__EXTERNAL_PORT__/g, '' + externalPort)
  })
  afterAll(async () => {
    server.close()
    nextConfig.restore()
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
