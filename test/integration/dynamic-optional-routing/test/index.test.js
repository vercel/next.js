/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import fs from 'fs-extra'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import cheerio from 'cheerio'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let app
let appPort
const appDir = join(__dirname, '../')

function runTests(dev) {
  it('should render catch-all top-level route with multiple segments', async () => {
    const html = await renderViaHTTP(appPort, '/hello/world')
    const $ = cheerio.load(html)
    expect($('#optional-route').text()).toBe('hello/world')
  })

  it('should render catch-all top-level route with single segment', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    const $ = cheerio.load(html)
    expect($('#optional-route').text()).toBe('hello')
  })

  it('should render catch-all top-level route with no segments', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect($('#optional-route').text()).toBe('')
  })

  it('should render catch-all nested route with multiple segments', async () => {
    const html = await renderViaHTTP(appPort, '/nested/hello/world')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe('hello/world')
  })

  it('should render catch-all nested route with single segment', async () => {
    const html = await renderViaHTTP(appPort, '/nested/hello')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe('hello')
  })

  it('should render catch-all nested route with no segments', async () => {
    const html = await renderViaHTTP(appPort, '/nested/')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe('')
  })
}

const nextConfig = join(appDir, 'next.config.js')

describe('Dynamic Routing', () => {
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
      const curConfig = await fs.readFile(nextConfig, 'utf8')

      if (curConfig.includes('target')) {
        await fs.writeFile(
          nextConfig,
          `
          module.exports = {
            experimental: {
              modern: true
            }
          }
        `
        )
      }
      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('serverless mode', () => {
    let origNextConfig

    beforeAll(async () => {
      origNextConfig = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless',
          experimental: {
            modern: true
          }
        }
      `
      )

      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origNextConfig)
      await killApp(app)
    })
    runTests()
  })
})
