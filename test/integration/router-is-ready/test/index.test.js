/* eslint-env jest */
import fs from 'fs-extra'
import {
  findPort,
  killApp,
  launchApp,
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import path, { join } from 'path'
import {
  nextBuild,
  nextStart,
  renderViaHTTP,
} from '../../../lib/next-test-utils'

jest.setTimeout(1000 * 30)

let app
let appPort
let server
const appDir = join(__dirname, '../')
const nextConfig = path.join(appDir, 'next.config.js')

function runTests(params) {
  describe(params ? `using query: ${params}` : 'with no query params', () => {
    const pathname = params ? `/?${params}` : '/'
    it('query params should not be populated on immediate sever load', async () => {
      const html = await renderViaHTTP(appPort, pathname)
      // this regex checks to make sure we don't have an element with id="test"
      expect(html).toMatch(/^((?!id="test").)*$/i)
      expect(html).toMatch(/id="isReady">ready: false/i)
    })

    it('query params should be populated on the client after hydration is complete', async () => {
      const browser = await webdriver(appPort, pathname)
      // we don't care about parameter hydration if we didn't pass any parameters
      if (params) {
        // if we did pass `test=true` we want to make sure it worked
        const text = await browser.elementByCss('#test').text()
        expect(text).toEqual('query: true')
      }
      // regardless, we want to make sure router.ready was set
      expect(await browser.elementByCss('#isReady').text()).toEqual(
        'ready: true'
      )
    })
  })
}

describe('next/dynamic', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
    runTests('test=true')
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await runNextCommand(['build', appDir])

      app = nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
      })

      server = await startApp(app)
      appPort = server.address().port
    })
    afterAll(() => stopApp(server))

    runTests()
    runTests('test=true')
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(nextConfig)
    })
    runTests()
    runTests('test=true')
  })
})
