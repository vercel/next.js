import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  File,
  waitFor,
  launchApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let app
let browser
let html

const indexPage = new File(join(appDir, 'pages/static-img.js'))

const runTests = (isDev = false) => {
  it('Should allow an image with a static src to omit height and width', async () => {
    expect(await browser.elementById('basic-static')).toBeTruthy()
    expect(await browser.elementById('blur-png')).toBeTruthy()
    expect(await browser.elementById('blur-webp')).toBeTruthy()
    expect(await browser.elementById('blur-avif')).toBeTruthy()
    expect(await browser.elementById('blur-jpg')).toBeTruthy()
    expect(await browser.elementById('static-svg')).toBeTruthy()
    expect(await browser.elementById('static-gif')).toBeTruthy()
    expect(await browser.elementById('static-bmp')).toBeTruthy()
    expect(await browser.elementById('static-ico')).toBeTruthy()
    expect(await browser.elementById('static-unoptimized')).toBeTruthy()
  })
  it('Should use immutable cache-control header for static import', async () => {
    await browser.eval(
      `document.getElementById("basic-static").scrollIntoView()`
    )
    await waitFor(1000)
    const url = await browser.eval(
      `document.getElementById("basic-static").src`
    )
    const res = await fetch(url)
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=315360000, immutable'
    )
  })

  if (!isDev) {
    it('Should use immutable cache-control header even when unoptimized', async () => {
      await browser.eval(
        `document.getElementById("static-unoptimized").scrollIntoView()`
      )
      await waitFor(1000)
      const url = await browser.eval(
        `document.getElementById("static-unoptimized").src`
      )
      const res = await fetch(url)
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      )
    })
  }
  it('Should automatically provide an image height and width', async () => {
    expect(html).toContain('width:400px;height:300px')
  })
  it('Should allow provided width and height to override intrinsic', async () => {
    expect(html).toContain('width:200px;height:200px')
    expect(html).not.toContain('width:400px;height:400px')
  })
  it('Should add a blur placeholder to statically imported jpg', async () => {
    expect(html).toContain(
      `style="position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url(${
        isDev
          ? '&quot;/docs/_next/image?url=%2Fdocs%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&amp;w=8&amp;q=70&quot;'
          : '&quot;data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAoKCgoKCgsMDAsPEA4QDxYUExMUFiIYGhgaGCIzICUgICUgMy03LCksNy1RQDg4QFFeT0pPXnFlZXGPiI+7u/sBCgoKCgoKCwwMCw8QDhAPFhQTExQWIhgaGBoYIjMgJSAgJSAzLTcsKSw3LVFAODhAUV5PSk9ecWVlcY+Ij7u7+//CABEIAAYACAMBIgACEQEDEQH/xAAnAAEBAAAAAAAAAAAAAAAAAAAABwEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAAmgP/xAAcEAACAQUBAAAAAAAAAAAAAAASFBMAAQMFERX/2gAIAQEAAT8AZ1HjrKZX55JysIc4Ff/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Af//Z&quot;'
      })`
    )
  })
  it('Should add a blur placeholder to statically imported png', async () => {
    expect(html).toContain(
      `style="position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url(${
        isDev
          ? '&quot;/docs/_next/image?url=%2Fdocs%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&amp;w=8&amp;q=70&quot;'
          : '&quot;data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAICAAAAAAZhBqgAAAAJklEQVR42mNgkmBkYGXgZGBoY2Co/lPAcOf/dYaCzHwGEBAVEwUAZZIG0TbWicQAAAAASUVORK5CYII=&quot;'
      })`
    )
  })
}

describe('Build Error Tests for basePath', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should throw build error when import statement is used with missing file', async () => {
      await indexPage.replace(
        '../public/foo/test-rect.jpg',
        '../public/foo/test-rect-broken.jpg'
      )

      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      await indexPage.restore()

      expect(stderr).toContain(
        "Module not found: Can't resolve '../public/foo/test-rect-broken.jpg"
      )
      // should contain the importing module
      expect(stderr).toContain('./pages/static-img.js')
    })
  })
})
describe('Static Image Component Tests for basePath', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      html = await renderViaHTTP(appPort, '/docs/static-img')
      browser = await webdriver(appPort, '/docs/static-img')
    })
    afterAll(() => {
      killApp(app)
    })
    runTests()
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      html = await renderViaHTTP(appPort, '/docs/static-img')
      browser = await webdriver(appPort, '/docs/static-img')
    })
    afterAll(() => {
      killApp(app)
    })
    runTests(true)
  })
})
