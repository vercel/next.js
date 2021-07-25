/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'
import fs from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

function runTests() {
  it('should inline critical CSS', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(
      /<link rel="stylesheet" href="\/_next\/static\/css\/.*\.css" .*>/
    )
    expect(html).toMatch(/body{font-family:SF Pro Text/)
  })

  it('should not inline non-critical css', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).not.toMatch(/.extra-style/)
  })
}

describe('CSS optimization for SSR apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { experimental: {optimizeCss: true} }`,
      'utf8'
    )

    if (fs.pathExistsSync(join(appDir, '.next'))) {
      await fs.remove(join(appDir, '.next'))
    }
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  runTests()
})

describe('CSS optimization for serverless apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { target: 'serverless', experimental: {optimizeCss: true} }`,
      'utf8'
    )
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  runTests()
})

describe('Font optimization for emulated serverless apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { target: 'experimental-serverless-trace', experimental: {optimizeCss: true} }`,
      'utf8'
    )
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
    await fs.remove(nextConfig)
  })
  runTests()
})
