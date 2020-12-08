/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { version } from 'next/package.json'
import {
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  File,
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
let stdout
let stderr
const appDir = join(__dirname, '../app')
const nextConfigPath = join(appDir, 'next.config.js')

function runTests() {
  it('should render tha page without error', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/home/)
  })

  it('should apply headTags from plugin correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    const found = Array.from($('head').children()).find((el) => {
      return (el.attribs.src || '').match(/googletagmanager.*?my-tracking-id/)
    })
    expect(found).toBeTruthy()
  })

  it('should call clientInit from plugin correctly', async () => {
    const browser = await webdriver(appPort, '/')
    expect(await browser.eval('window.didClientInit')).toBe(true)
  })

  it('should list loaded plugins', async () => {
    expect(stdout).toMatch(/loaded plugin: @next\/plugin-google-analytics/i)
  })

  it('should ignore directories in plugins', async () => {
    expect(stderr).not.toMatch(/listed invalid middleware/i)
  })
}

const pluginPkgJson = new File(
  join(appDir, 'node_modules/@next/plugin-google-analytics/package.json')
)

describe('Next.js plugins', () => {
  beforeAll(async () => {
    pluginPkgJson.replace('0.0.1', version)
  })
  afterAll(() => pluginPkgJson.restore())

  describe('version mismatch error', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfigPath,
        `module.exports = { env: { GA_TRACKING_ID: 'my-tracking-id' }, experimental: { plugins: true } }`
      )
      pluginPkgJson.replace(version, '0.0.1')
    })
    afterAll(async () => {
      pluginPkgJson.restore()
      pluginPkgJson.replace('0.0.1', version)
      await fs.remove(nextConfigPath)
    })
    it('should show error when plugin version mismatches', async () => {
      let output = ''
      const handleOutput = (msg) => {
        output += msg || ''
      }

      app = await launchApp(appDir, await findPort(), {
        onStdout: handleOutput,
        onStderr: handleOutput,
      })

      try {
        await check(
          () => output,
          /Next.js plugin versions must match the Next.js version being used/
        )
      } finally {
        if (app) {
          await killApp(app)
        }
      }
    })
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfigPath,
        `module.exports = { env: { GA_TRACKING_ID: 'my-tracking-id' }, experimental: { plugins: true } }`
      )
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStdout(msg) {
          stdout += msg
        },
        onStderr(msg) {
          stderr += msg
        },
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
        stderr = ''
        app = await launchApp(appDir, appPort, {
          onStdout(msg) {
            stdout += msg
          },
          onStderr(msg) {
            stderr += msg
          },
        })
      })
      afterAll(() => killApp(app))

      it('should disable auto detecting plugins when plugin config is used', async () => {
        expect(stdout).toMatch(/loaded plugin: @next\/plugin-google-analytics/i)
      })

      it('should expose a plugins config', async () => {
        const browser = await webdriver(appPort, '/')
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
        stdout: true,
        stderr: true,
      })
      stdout = results.stdout
      stderr = results.stderr
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
        stdout: true,
        stderr: true,
      })
      stdout = results.stdout
      stderr = results.stderr
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
