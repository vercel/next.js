/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  fetchViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

let appPort
let app

const runTests = () => {
  it('should respond to a not existing page with 404', async () => {
    const res = await fetchViaHTTP(appPort, '/post/2')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('custom 404 page')
  })
}

describe('Custom 404 Page for static site generation with dynamic routes', () => {
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
