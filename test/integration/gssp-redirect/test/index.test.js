/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

let app
let appPort

const runTests = () => {
  it('should apply temporary redirect when visited directly for GSSP page', async () => {})

  it('should apply permanent redirect when visited directly for GSSP page', async () => {})

  it('should apply redirect when fallback GSP page is visited directly (internal)', async () => {})

  it('should apply redirect when fallback GSP page is visited directly (external)', async () => {})

  it('should apply redirect when GSSP page is navigated to client-side (internal)', async () => {})

  it('should apply redirect when GSSP page is navigated to client-side (external)', async () => {})

  it('should apply redirect when GSP page is navigated to client-side (internal)', async () => {})

  it('should apply redirect when GSP page is navigated to client-side (external)', async () => {})
}

describe('GS(S)P Redirect Support', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
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
        nextConfig,
        `module.exports = {
        target: 'experimental-serverless-trace'
      }`
      )
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
      await killApp(app)
    })

    runTests()
  })
})
