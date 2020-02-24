/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import {
  nextBuild,
  findPort,
  launchApp,
  killApp,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '..')
const envFile = join(appDir, '.env')
const nextConfig = join(appDir, 'next.config.js')

let app
let appPort
let output = ''

const envValues = ['NOTION_KEY', 'SENTRY_DSN', 'DATABASE_KEY', 'DATABASE_USER']

const writeEnv = () =>
  fs.writeFile(envFile, envValues.map(val => `${val}=value`).join('\n'))
const rmEnv = () => fs.remove(envFile)

const runTests = (isDev = false) => {
  const startApp = async () => {
    output = ''
    appPort = await findPort()
    let method = isDev ? launchApp : nextStart

    app = await method(appDir, appPort, {
      onStdout(msg) {
        output += msg
      },
      onStderr(msg) {
        output += msg
      },
    })
  }

  if (isDev) {
    it('should warn for missing values on SSG page', async () => {
      await startApp()
      await renderViaHTTP(appPort, '/')
      await killApp(app)
      expect(output).toContain(
        `Missing env values: ${envValues.join(', ')} for /`
      )
    })

    it('should not warn for missing values on SSG page', async () => {
      await writeEnv()
      await startApp()
      await renderViaHTTP(appPort, '/')
      await killApp(app)
      await rmEnv()
      expect(output).not.toContain(
        `Missing env values: ${envValues.join(', ')} for /`
      )
    })
  }

  it('should warn for missing values on server props page', async () => {
    await startApp()
    await renderViaHTTP(appPort, '/ssp')
    await killApp(app)
    expect(output).toContain(
      `Missing env values: ${envValues.join(', ')} for /ssp`
    )
  })

  it('should not warn for missing values on server props page', async () => {
    await writeEnv()
    await startApp()
    await renderViaHTTP(appPort, '/ssp')
    await killApp(app)
    await rmEnv()
    expect(output).not.toContain(
      `Missing env values: ${envValues.join(', ')} for /ssp`
    )
  })

  it('should warn for missing values on API route', async () => {
    await startApp()
    await renderViaHTTP(appPort, '/api/hello')
    await killApp(app)
    expect(output).toContain(
      `Missing env values: ${envValues.join(', ')} for /api/hello`
    )
  })

  it('should not warn for missing values on API route', async () => {
    await writeEnv()
    await startApp()
    await renderViaHTTP(appPort, '/api/hello')
    await killApp(app)
    await rmEnv()
    expect(output).not.toContain(
      `Missing env values: ${envValues.join(', ')} for /api/hello`
    )
  })
}

describe('Env Config', () => {
  afterEach(async () => {
    await fs.remove(envFile)
    await fs.remove(nextConfig)
    try {
      await killApp(app)
    } catch (_) {}
  })

  describe('dev mode', () => {
    runTests(true)
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
    })
    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'experimental-serverless-trace' }`
      )
      await nextBuild(appDir)
    })
    runTests()
  })
})
