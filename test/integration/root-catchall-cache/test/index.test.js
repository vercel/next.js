/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let app
let appPort

const getRandom = async (path) => {
  const html = await renderViaHTTP(appPort, path)
  const $ = cheerio.load(html)
  return $('#random').text()
}

const runTests = () => {
  it('should cache / correctly', async () => {
    const random = await getRandom('/')

    {
      //cached response (revalidate is 2 seconds)
      await waitFor(1000)
      const newRandom = await getRandom('/')
      expect(random).toBe(newRandom)
    }
    {
      //stale response, triggers revalidate
      await waitFor(1000)
      const newRandom = await getRandom('/')
      expect(random).toBe(newRandom)
    }
    {
      //new response
      await waitFor(100)
      const newRandom = await getRandom('/')
      expect(random).not.toBe(newRandom)
    }
  })
}

describe('Root Catch-all Cache', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
})
