/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  waitFor,
  nextBuild,
  nextStart,
  renderViaHTTP
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let app
let appPort
const appDir = join(__dirname, '../app')
const nextConfigPath = join(appDir, 'next.config.js')

function runTests () {
  it('should render tha page without error', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/home/)
  })

  it('should apply htmlProps from plugin correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect($('html').attr('lang')).toBe('en')
  })

  it('should apply headTags from plugin correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    const found = Array.from($('head').children()).find(el => {
      return (el.attribs.src || '').match(/googletagmanager.*?my-tracking-id/)
    })
    expect(found).toBeTruthy()
  })

  it('should apply bodyTags from plugin correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    const found = Array.from($('body').children()).find(
      el =>
        el.type === 'script' &&
        el.children[0] &&
        el.children[0].data.includes('console.log')
    )
    expect(found).toBeTruthy()
  })

  it('should call clientInit from plugin correctly', async () => {
    const browser = await webdriver(appPort, '/')
    await waitFor(250)
    expect(await browser.eval('window.didClientInit')).toBe(true)
  })
}

describe('Next.js plugins', () => {
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
      await fs.writeFile(
        nextConfigPath,
        `module.exports = { env: { GA_TRACKING_ID: 'my-tracking-id' } }`
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfigPath,
        `module.exports = { target: 'serverless', env: { GA_TRACKING_ID: 'my-tracking-id' } }`
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
