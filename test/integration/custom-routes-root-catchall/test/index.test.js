/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let appDir = join(__dirname, '..')
let buildId
let appPort
let app

const runTests = () => {
  it('should match root', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    const props = JSON.parse($('#props').text())
    expect(props).toEqual({ query: {} })
  })

  it('should match one level', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    const $ = cheerio.load(html)
    const props = JSON.parse($('#props').text())
    expect(props).toEqual({ query: { path: ['hello'] } })
  })

  it('should match two levels', async () => {
    const html = await renderViaHTTP(appPort, '/hello/world')
    const $ = cheerio.load(html)
    const props = JSON.parse($('#props').text())
    expect(props).toEqual({ query: { path: ['hello', 'world'] } })
  })

  it('should rewrite to /_next/static correctly', async () => {
    const bundlePath = await join(
      '/_next/static/',
      buildId,
      '_buildManifest.js'
    )
    const data = await renderViaHTTP(appPort, bundlePath)
    expect(data).toContain('/params')
  })

  it('should match public/static correctly', async () => {
    const data = await renderViaHTTP(appPort, '/static/data.json')
    expect(data).toContain('some data...')
  })

  it('should match public file correctly', async () => {
    const data = await renderViaHTTP(appPort, '/another.txt')
    expect(data).toContain('some text')
  })
}

describe('Custom routes', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      buildId = 'development'
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
