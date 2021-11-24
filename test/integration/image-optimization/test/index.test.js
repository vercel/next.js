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

jest.setTimeout(1000 * 60)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

function runTests() {
  describe('On a static page', () => {
    checkImagesOnPage('/')
  })

  describe('On an SSR page', () => {
    checkImagesOnPage('/stars')
  })

  describe('On a static page with querystring ', () => {
    it('should preload exactly eligible image', async () => {
      const html = await renderViaHTTP(appPort, '/with-querystring')
      expect(html).toContain(
        '<link rel="preload" href="https://image.example.org/?lang[]=c++" as="image"/>'
      )
      expect(html).toContain(
        '<link rel="preload" href="/api/image?lang[]=c++" as="image"/>'
      )
    })
  })
}

function checkImagesOnPage(path) {
  it('should not preload tiny images', async () => {
    const html = await renderViaHTTP(appPort, path)
    expect(html).not.toContain(
      '<link rel="preload" href="tiny-image.jpg" as="image"/>'
    )
  })
  it('should not add a preload if one already exists', async () => {
    let html = await renderViaHTTP(appPort, path)
    html = html.replace(
      '<link rel="preload" href="already-preloaded.jpg" as="image"/>',
      ''
    )
    expect(html).not.toContain(
      '<link rel="preload" href="already-preloaded.jpg" as="image"/>'
    )
  })
  it('should not preload hidden images', async () => {
    const html = await renderViaHTTP(appPort, path)
    expect(html).not.toContain(
      '<link rel="preload" href="hidden-image-1.jpg" as="image"/>'
    )
    expect(html).not.toContain(
      '<link rel="preload" href="hidden-image-2.jpg" as="image"/>'
    )
  })
  it('should not preload SVG images', async () => {
    const html = await renderViaHTTP(appPort, path)
    expect(html).not.toContain(
      '<link rel="preload" href="vector-image.svg" as="image"/>'
    )
  })
  it('should preload exactly two eligible images', async () => {
    const html = await renderViaHTTP(appPort, path)
    expect(html).toContain(
      '<link rel="preload" href="main-image-1.jpg" as="image"/>'
    )
    expect(html).not.toContain(
      '<link rel="preload" href="main-image-2.jpg" as="image"/>'
    )
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
