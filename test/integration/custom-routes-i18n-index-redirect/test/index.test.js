/* eslint-env jest */

import url from 'url'
import http from 'http'
import { join } from 'path'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  fetchViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let server
let externalPort
let appPort
let app

const runTests = () => {
  it('should respond to default locale redirects correctly for index redirect', async () => {
    for (const [path, dest] of [
      ['/', '/destination'],
      ['/en', '/destination'],
      ['/fr', '/fr/destination'],
    ]) {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })

      expect(res.status).toBe(dest ? 307 : 404)

      if (dest) {
        const text = await res.text()
        expect(text).toEqual(dest)
        if (dest.startsWith('/')) {
          const parsed = url.parse(res.headers.get('location'))
          expect(parsed.pathname).toBe(dest)
          expect(parsed.query).toBe(null)
        } else {
          expect(res.headers.get('location')).toBe(dest)
        }
      }
    }
  })
}

describe('Custom routes i18n with index redirect', () => {
  beforeAll(async () => {
    externalPort = await findPort()
    server = http.createServer((_req, res) => {
      res.statusCode = 200
      res.end()
    })
    await new Promise((res, rej) => {
      server.listen(externalPort, (err) => (err ? rej(err) : res()))
    })
  })
  afterAll(async () => {
    server.close()
  })

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
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
