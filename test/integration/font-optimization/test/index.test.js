/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
  initNextServerScript,
} from 'next-test-utils'
import fs from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let builtServerPagesDir
let builtPage
let appPort
let app

const fsExists = (file) =>
  fs
    .access(file)
    .then(() => true)
    .catch(() => false)

async function getBuildId() {
  return fs.readFile(join(appDir, '.next', 'BUILD_ID'), 'utf8')
}

const startServerlessEmulator = async (dir, port) => {
  const scriptPath = join(dir, 'server.js')
  const env = Object.assign(
    {},
    { ...process.env },
    { PORT: port, BUILD_ID: await getBuildId() }
  )
  return initNextServerScript(scriptPath, /ready on/i, env)
}

function runTests() {
  it('should inline the google fonts for static pages', async () => {
    const html = await renderViaHTTP(appPort, '/index')
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
    expect(html).toContain(
      '<link rel="stylesheet" data-href="https://fonts.googleapis.com/css?family=Voces"/>'
    )
    expect(html).toMatch(
      /<style data-href="https:\/\/fonts\.googleapis\.com\/css\?family=Voces">.*<\/style>/
    )
  })

  it('should inline the google fonts for static pages with Next/Head', async () => {
    const html = await renderViaHTTP(appPort, '/static-head')
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
    expect(html).toContain(
      '<link rel="stylesheet" data-href="https://fonts.googleapis.com/css2?family=Modak"/>'
    )
    expect(html).toMatch(
      /<style data-href="https:\/\/fonts\.googleapis\.com\/css2\?family=Modak">.*<\/style>/
    )
  })

  it('should inline the google fonts for SSR pages', async () => {
    const html = await renderViaHTTP(appPort, '/stars')
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
    expect(html).toContain(
      '<link rel="stylesheet" data-href="https://fonts.googleapis.com/css2?family=Roboto:wght@700"/>'
    )
    expect(html).toMatch(
      /<style data-href="https:\/\/fonts\.googleapis\.com\/css2\?family=Roboto:wght@700">.*<\/style>/
    )
  })

  it('should skip this optimization for AMP pages', async () => {
    const html = await renderViaHTTP(appPort, '/amp')
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
    expect(html).toContain(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Voces">'
    )
  })

  it('should minify the css', async () => {
    const snapshotJson = JSON.parse(
      await fs.readFile(join(__dirname, 'manifest-snapshot.json'), {
        encoding: 'utf-8',
      })
    )
    const testJson = JSON.parse(
      await fs.readFile(builtPage('font-manifest.json'), { encoding: 'utf-8' })
    )
    const testCss = {}
    testJson.forEach((fontDefinition) => {
      testCss[fontDefinition.url] = fontDefinition.content
    })
    const snapshotCss = {}
    snapshotJson.forEach((fontDefinition) => {
      snapshotCss[fontDefinition.url] = fontDefinition.content
    })

    expect(testCss).toStrictEqual(snapshotCss)
  })
}

describe.skip('Font optimization for SSR apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { experimental: {optimizeFonts: true} }`,
      'utf8'
    )

    if (fs.pathExistsSync(join(appDir, '.next'))) {
      await fs.remove(join(appDir, '.next'))
    }
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    builtServerPagesDir = join(appDir, '.next', 'server')
    builtPage = (file) => join(builtServerPagesDir, file)
  })
  afterAll(() => killApp(app))
  runTests()
})

describe.skip('Font optimization for serverless apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { target: 'serverless', experimental: {optimizeFonts: true} }`,
      'utf8'
    )
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    builtServerPagesDir = join(appDir, '.next', 'serverless')
    builtPage = (file) => join(builtServerPagesDir, file)
  })
  afterAll(() => killApp(app))
  runTests()
})

describe.skip('Font optimization for emulated serverless apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { target: 'experimental-serverless-trace', experimental: {optimizeFonts: true} }`,
      'utf8'
    )
    await nextBuild(appDir)
    appPort = await findPort()
    await startServerlessEmulator(appDir, appPort)
    builtServerPagesDir = join(appDir, '.next', 'serverless')
    builtPage = (file) => join(builtServerPagesDir, file)
  })
  afterAll(async () => {
    await fs.remove(nextConfig)
  })
  runTests()
})
