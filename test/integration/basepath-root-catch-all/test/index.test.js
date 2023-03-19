import {
  nextBuild,
  findPort,
  killApp,
  nextStart,
  launchApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'
import fs from 'fs-extra'
import url from 'url'

let app
let appPort
let buildId
const appDir = join(__dirname, '..')

const runTests = () => {
  it('should use correct data URL for root catch-all', async () => {
    const browser = await webdriver(appPort, '/docs/hello')
    await browser.elementByCss('#root-catchall-link').click()
    await browser.waitForElementByCss('#url')

    const dataUrl = await browser.elementByCss('#url').text()
    const { pathname } = url.parse(dataUrl)
    expect(pathname).toBe(`/_next/data/${buildId}/root/catch-all.json`)
  })
}

describe('dev mode', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    buildId = 'development'
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))
  runTests()
})

describe('production mode', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  runTests()
})
