/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  renderViaHTTP,
  fetchViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

let appPort
let buildId
let app

const runTests = mode => {
  const isDev = mode === 'dev'

  it('should respond to 404 correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/404')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('This page could not be found')
  })

  it('should render error correctly', async () => {
    const text = await renderViaHTTP(appPort, '/err')
    expect(text).toContain(isDev ? 'oops' : 'Internal Server Error')
  })

  it('should render index page normal', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('hello from index')
  })

  if (!isDev) {
    it('should set pages404 in routes-manifest correctly', async () => {
      const data = await fs.readJSON(join(appDir, '.next/routes-manifest.json'))
      expect(data.pages404).toBe(true)
    })

    it('should have output 404.html', async () => {
      expect(
        await fs
          .access(
            join(
              appDir,
              '.next',
              ...(mode === 'server'
                ? ['server', 'static', buildId, 'pages']
                : ['serverless', 'pages']),
              '404.html'
            )
          )
          .then(() => true)
          .catch(() => false)
      ).toBe(true)
    })
  }
}

describe('Default 404 Page with custom _error', () => {
  describe('server mode', () => {
    afterAll(() => killApp(app))

    it('should build successfully', async () => {
      const { code } = await nextBuild(appDir, [], {
        stderr: true,
        stdout: true,
      })

      expect(code).toBe(0)

      appPort = await findPort()

      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })

    runTests('server')
  })

  describe('serverless mode', () => {
    afterAll(async () => {
      await fs.remove(nextConfig)
      await killApp(app)
    })

    it('should build successfully', async () => {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = { target: 'experimental-serverless-trace' }
      `
      )
      const { code } = await nextBuild(appDir, [], {
        stderr: true,
        stdout: true,
      })

      expect(code).toBe(0)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })

    runTests('serverless')
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('dev')
  })
})
