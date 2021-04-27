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
import cheerio from 'cheerio'

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

  it('should pass nonce to the inlined font definition', async () => {
    const html = await renderViaHTTP(appPort, '/nonce')
    const $ = cheerio.load(html)
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)

    const link = $(
      'link[rel="stylesheet"][data-href="https://fonts.googleapis.com/css2?family=Modak"]'
    )
    const nonce = link.attr('nonce')
    const style = $(
      'style[data-href="https://fonts.googleapis.com/css2?family=Modak"]'
    )
    const styleNonce = style.attr('nonce')

    expect(link).toBeDefined()
    expect(nonce).toBe('VmVyY2Vs')
    expect(styleNonce).toBe('VmVyY2Vs')
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

  it('should only inline included fonts per page', async () => {
    const html = await renderViaHTTP(appPort, '/with-font')
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
    expect(html).toContain(
      '<link rel="stylesheet" data-href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&amp;display=swap"/>'
    )
    expect(html).toMatch(
      /<style data-href="https:\/\/fonts\.googleapis\.com\/css2\?family=Roboto:wght@400;700;900&display=swap">.*<\/style>/
    )

    const htmlWithoutFont = await renderViaHTTP(appPort, '/without-font')
    expect(htmlWithoutFont).not.toContain(
      '<link rel="stylesheet" data-href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&amp;display=swap"/>'
    )
    expect(htmlWithoutFont).not.toMatch(
      /<style data-href="https:\/\/fonts\.googleapis\.com\/css2\?family=Roboto:wght@400;700;900&display=swap">.*<\/style>/
    )
  })

  it.skip('should minify the css', async () => {
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

describe('Font optimization for SSR apps', () => {
  beforeAll(async () => {
    await fs.writeFile(nextConfig, `module.exports = {}`, 'utf8')

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

describe('Font optimization for serverless apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { target: 'serverless' }`,
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

describe('Font optimization for emulated serverless apps', () => {
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { target: 'experimental-serverless-trace' }`,
      'utf8'
    )
    await nextBuild(appDir)
    appPort = await findPort()
    app = await startServerlessEmulator(appDir, appPort)
    builtServerPagesDir = join(appDir, '.next', 'serverless')
    builtPage = (file) => join(builtServerPagesDir, file)
  })
  afterAll(async () => {
    await killApp(app)
    await fs.remove(nextConfig)
  })
  runTests()
})

describe('Font optimization for unreachable font definitions.', () => {
  beforeAll(async () => {
    await fs.writeFile(nextConfig, `module.exports = { }`, 'utf8')
    await nextBuild(appDir)
    await fs.writeFile(
      join(appDir, '.next', 'server', 'font-manifest.json'),
      '[]',
      'utf8'
    )
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    builtServerPagesDir = join(appDir, '.next', 'serverless')
    builtPage = (file) => join(builtServerPagesDir, file)
  })
  afterAll(() => killApp(app))
  it('should fallback to normal stylesheet if the contents of the fonts are unreachable', async () => {
    const html = await renderViaHTTP(appPort, '/stars')
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
    expect(html).toContain(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@700"/>'
    )
  })
  it('should not inline multiple fallback link tag', async () => {
    await renderViaHTTP(appPort, '/stars')
    // second render to make sure that the page is requested more than once.
    const html = await renderViaHTTP(appPort, '/stars')
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
    expect(html).not.toContain(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Voces"/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@700"/><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Voces"/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@700"/>'
    )
  })
})
