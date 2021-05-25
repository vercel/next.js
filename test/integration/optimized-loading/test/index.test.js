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
let server
let app
jest.setTimeout(1000 * 60 * 5)

const context = {}

function runTests(url) {
  it('should render the page', async () => {
    const html = await renderViaHTTP(context.appPort, url)
    expect(html).toMatch(/Hello World/)
  })

  it('should not have JS preload links', async () => {
    const html = await renderViaHTTP(context.appPort, url)
    const $ = cheerio.load(html)
    expect($('link[rel=preload]').length).toBe(0)
  })

  it('should load scripts with defer in head', async () => {
    const html = await renderViaHTTP(context.appPort, url)
    const $ = cheerio.load(html)
    expect($('script[async]').length).toBe(0)
    expect($('head script[defer]').length).toBeGreaterThan(0)
  })
}

describe('Optimized loading', () => {
  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      app = nextServer({
        dir: join(__dirname, '../'),
        dev: false,
        quiet: true,
      })

      server = await startApp(app)
      context.appPort = server.address().port
    })
    afterAll(() => stopApp(server))

    runTests('/')
    runTests('/page1')
  })

  describe('dev mode', () => {
    let app

    beforeAll(async () => {
      context.appPort = await findPort()
      app = await launchApp(join(__dirname, '../'), context.appPort)
    })

    afterAll(() => killApp(app))

    runTests('/')
    runTests('/page1')
  })
})
