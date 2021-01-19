/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
let app
jest.setTimeout(1000 * 60 * 5)

const context = {}

describe('disabled JS preloads', () => {
  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      app = nextServer({
        dir: join(__dirname, '../'),
        dev: false,
        quiet: true,
      })

      server = await startApp(app)
      context.appPort = appPort = server.address().port
    })
    afterAll(() => stopApp(server))

    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)
    })

    it('should not have JS preload links', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(html)
      expect($('link[rel=preload]').length).toBe(0)
    })
  })

  describe('dev mode', () => {
    let appPort
    let app

    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(join(__dirname, '../'), appPort)
    })

    afterAll(() => killApp(app))

    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)
    })

    it('should not have JS preload links', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(html)
      expect($('link[rel=preload]').length).toBe(0)
    })
  })
})
