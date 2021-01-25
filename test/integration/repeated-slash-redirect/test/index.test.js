/* eslint-env jest */

import cheerio from 'cheerio'
import fs from 'fs-extra'
import { join } from 'path'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  fetchViaHTTP,
  renderViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 60 * 2)

let appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')
let nextConfigContent
let appPort
let app

function getPathWithNormalizedQuery(url) {
  const parsed = new URL(url, 'http://n')
  if (parsed.search) {
    parsed.search = `?${parsed.searchParams}`
  }
  return parsed.pathname + parsed.search
}

const runTests = (isDev = false) => {
  const cases = [
    ['//hello/world', '/hello/world'],
    ['/hello//world', '/hello/world'],
    ['/hello/world//', '/hello/world'],
    ['/hello///world', '/hello/world'],
    ['/hello///world////foo', '/hello/world/foo'],
    ['/hello//world?foo=bar//baz', '/hello/world?foo=bar//baz'],
  ]

  it.each(cases)('it should redirect %s to %s', async (from, to) => {
    const res = await fetchViaHTTP(appPort, from)
    expect(getPathWithNormalizedQuery(res.url)).toBe(
      getPathWithNormalizedQuery(to)
    )
  })

  it.each(cases)('it should rewrite href %s to %s', async (from, to) => {
    const content = await renderViaHTTP(appPort, `/linker?href=${from}`)
    const $ = cheerio.load(content)
    expect($('#link').attr('href')).toBe(to)
  })

  it.each(cases)('it should navigate a href %s to %s', async (from, to) => {
    const browser = await webdriver(appPort, `/linker?href=${from}`)
    await browser.elementByCss('#link').click()
    await browser.waitForElementByCss('#page')
    const href = await browser.eval('window.location.href')
    expect(getPathWithNormalizedQuery(href)).toBe(
      getPathWithNormalizedQuery(to)
    )
  })
}

describe('Repeated trailing slashes', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir, [], {
        stdout: true,
      })
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      nextConfigContent = await fs.readFile(nextConfigPath, 'utf8')
      await fs.writeFile(
        nextConfigPath,
        nextConfigContent.replace(/\/\/ target/, 'target'),
        'utf8'
      )
      await nextBuild(appDir, [], {
        stdout: true,
      })
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.writeFile(nextConfigPath, nextConfigContent, 'utf8')
      await killApp(app)
    })

    runTests()
  })
})
