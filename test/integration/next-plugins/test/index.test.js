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
let stdout
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

  it('should list loaded plugins', async () => {
    expect(stdout).toMatch(/loaded plugin: @next\/plugin-google-analytics/i)
    expect(stdout).toMatch(/loaded plugin: @zeit\/next-plugin-scope/i)
    expect(stdout).toMatch(/loaded plugin: next-plugin-normal/i)
  })
}

describe('Next.js plugins', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfigPath,
        `module.exports = { env: { GA_TRACKING_ID: 'my-tracking-id' }, experimental: { plugins: true } }`
      )
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStdout (msg) {
          stdout += msg
        }
      })
    })
    afterAll(() => killApp(app))

    runTests(true)

    describe('with plugin config', () => {
      beforeAll(async () => {
        await killApp(app)
        await fs.writeFile(
          nextConfigPath,
          `
        module.exports = {
          experimental: {
            plugins: true
          },
          plugins: [
            {
              name: '@next/plugin-google-analytics',
              config: { hello: 'world' }
            }
          ],
          env: {
            GA_TRACKING_ID: 'my-tracking-id'
          }
        }`
        )
        appPort = await findPort()
        stdout = ''
        app = await launchApp(appDir, appPort, {
          onStdout (msg) {
            stdout += msg
          }
        })
      })
      afterAll(() => killApp(app))

      it('should disable auto detecting plugins when plugin config is used', async () => {
        expect(stdout).toMatch(/loaded plugin: @next\/plugin-google-analytics/i)
        expect(stdout).not.toMatch(/loaded plugin: @zeit\/next-plugin-scope/i)
        expect(stdout).not.toMatch(/loaded plugin: next-plugin-normal/i)
      })

      it('should expose a plugins config', async () => {
        const browser = await webdriver(appPort, '/')
        await waitFor(500)
        expect(await browser.eval('window.initClientConfig')).toBe('world')
      })
    })
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfigPath,
        `module.exports = { env: { GA_TRACKING_ID: 'my-tracking-id' }, experimental: { plugins: true } }`
      )
      const results = await nextBuild(appDir, undefined, {
        stdout: true
      })
      stdout = results.stdout
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(nextConfigPath)
    })

    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfigPath,
        `module.exports = { target: 'serverless', env: { GA_TRACKING_ID: 'my-tracking-id' }, experimental: { plugins: true } }`
      )
      const results = await nextBuild(appDir, undefined, {
        stdout: true
      })
      stdout = results.stdout
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(nextConfigPath)
    })

    runTests()
  })
})
