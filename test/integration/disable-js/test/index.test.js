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

describe('disabled runtime JS', () => {
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

    it('should not have __NEXT_DATA__ script', async () => {
      const html = await renderViaHTTP(appPort, '/')

      const $ = cheerio.load(html)
      expect($('script#__NEXT_DATA__').length).toBe(0)
    })

    it('should not have scripts', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(html)
      expect($('script[src]').length).toBe(0)
    })

    it('should not have preload links', async () => {
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

    it('should not have __NEXT_DATA__ script', async () => {
      const html = await renderViaHTTP(appPort, '/')

      const $ = cheerio.load(html)
      expect($('script#__NEXT_DATA__').length).toBe(1)
    })
    it('should have preload links', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(html)
      expect($('link[rel=preload]').length).toBeGreaterThan(0)
    })
    it('should have a script for each preload link', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(html)
      const preloadLinks = $('link[rel=preload]')
      preloadLinks.each((idx, element) => {
        const url = $(element).attr('href')
        expect($(`script[src="${url}"]`).length).toBe(1)
      })
    })
  })
})
