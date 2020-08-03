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

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

function runTests() {
  it('should add a preload tag for first two hero images on static page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    console.log('HTML IS ' + html)
    expect(html).toEqual('foo')
    // expect(html).not.toContain(
    //   '<link rel="preload" href="main-image-1.jpg"/>'
    // )
    // expect(html).not.toContain(
    //   '<link rel="preload" href="main-image-2.jpg"/>'
    // )
    // expect(html).not.toContain(
    //   '<link rel="preload" href="main-image-3.jpg"/>'
    // )
  })
  it('should add a preload tag for first two hero images on SSR page', async () => {
    const html = await renderViaHTTP(appPort, '/stars')
    console.log('HTML (SSR) IS ' + html)
    expect(html).toEqual('foo')
    // expect(html).not.toContain(
    //   '<link rel="preload" href="main-image-1.jpg"/>'
    // )
    // expect(html).not.toContain(
    //   '<link rel="preload" href="main-image-2.jpg"/>'
    // )
    // expect(html).not.toContain(
    //   '<link rel="preload" href="main-image-3.jpg"/>'
    // )
  })
}

describe('Image optimization for SSR apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { experimental: {optimizeImages: true} }`,
      'utf8'
    )
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  runTests()
})

describe('Image optimization for serverless apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { target: 'serverless', experimental: {optimizeImages: true} }`,
      'utf8'
    )
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  runTests()
})
