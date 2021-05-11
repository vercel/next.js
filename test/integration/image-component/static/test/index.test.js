import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app
let browser
let html

const runTests = () => {
  it('Should allow an image with a static src to omit height and width', async () => {
    expect(await browser.elementById('basic-static')).toBeTruthy()
  })
  it('Should automatically provide an image height and width', async () => {
    expect(html).toContain('width:400px;height:300px')
  })
  it('Should append "&s=true" to URLs of static images', async () => {
    expect(
      await browser.elementById('basic-static').getAttribute('src')
    ).toContain('&s=true')
  })
  it('Should not append "&s=true" to URLs of non-static images', async () => {
    expect(
      await browser.elementById('basic-non-static').getAttribute('src')
    ).not.toContain('&s=true')
  })
}

describe('Static Image Component Tests', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    html = await renderViaHTTP(appPort, '/')
    browser = await webdriver(appPort, '/')
  })
  afterAll(() => killApp(app))
  runTests()
})
