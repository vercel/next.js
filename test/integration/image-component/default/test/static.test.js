import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  File,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app
let browser
let html

const indexPage = new File(join(appDir, 'pages/static.js'))
const nextConfig = new File(join(appDir, 'next.config.js'))

const runTests = () => {
  it('Should allow an image with a static src to omit height and width', async () => {
    expect(await browser.elementById('basic-static')).toBeTruthy()
    expect(await browser.elementById('format-test-0')).toBeTruthy()
    expect(await browser.elementById('format-test-1')).toBeTruthy()
    expect(await browser.elementById('format-test-2')).toBeTruthy()
    expect(await browser.elementById('format-test-3')).toBeTruthy()
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

describe('Build Error Tests', () => {
  it('should throw build error when import statement is used with missing file', async () => {
    await indexPage.replace(
      '../public/foo/test-rect.jpg',
      '../public/foo/test-rect-broken.jpg'
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    await indexPage.restore()

    expect(stderr).toContain(
      "Error: Can't resolve '../public/foo/test-rect-broken.jpg"
    )
  })
})
describe('Static Image Component Tests', () => {
  beforeAll(async () => {
    nextConfig.write(
      `
        module.exports = {
          experimental: {
            staticImages: true,
          },
        }
      `
    )

    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    html = await renderViaHTTP(appPort, '/static')
    browser = await webdriver(appPort, '/static')
  })
  afterAll(() => {
    nextConfig.delete()
    killApp(app)
  })
  runTests()
})
