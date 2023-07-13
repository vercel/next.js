import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  File,
  launchApp,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let app
let browser
let html
let $

const indexPage = new File(join(appDir, 'pages/static-img.js'))

const runTests = (isDev) => {
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
  if (!isDev) {
    // cache-control is set to "0, no-store" in dev mode
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
    const img = $('#basic-non-static')
    expect(img.attr('width')).toBe('400')
    expect(img.attr('height')).toBe('300')
  })
  it('should use width and height prop to override import', async () => {
    const img = $('#defined-width-and-height')
    expect(img.attr('width')).toBe('150')
    expect(img.attr('height')).toBe('150')
  })
  it('should use height prop to adjust both width and height', async () => {
    const img = $('#defined-height-only')
    expect(img.attr('width')).toBe('600')
    expect(img.attr('height')).toBe('350')
  })
  it('should use width prop to adjust both width and height', async () => {
    const img = $('#defined-width-only')
    expect(img.attr('width')).toBe('400')
    expect(img.attr('height')).toBe('233')
  })

  it('should add a blur placeholder a statically imported jpg', async () => {
    const style = $('#basic-static').attr('style')
    if (isDev) {
      expect(style).toBe(
        `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("/docs/_next/image?url=%2Fdocs%2F_next%2Fstatic%2Fmedia%2Ftest-rect.f323a148.jpg&w=8&q=70")`
      )
    } else {
      expect(style).toBe(
        `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 6' width='8' height='6'%3e%3cfilter id='b' color-interpolation-filters='sRGB'%3e%3cfeMorphology in='SourceAlpha' operator='dilate' radius='15' result='d'%3e%3c/feMorphology%3e%3cfeGaussianBlur in='d' stdDeviation='15' result='m'%3e%3c/feGaussianBlur%3e%3cfeGaussianBlur in='SourceGraphic' stdDeviation='1' result='b'%3e%3c/feGaussianBlur%3e%3cfeComponentTransfer in='b' result='s'%3e%3cfeFuncA type='table' tableValues='1 1'%3e%3c/feFuncA%3e%3c/feComponentTransfer%3e%3cfeComposite in2='m' in='s' operator='in' result='c'%3e%3c/feComposite%3e%3cfeMerge%3e%3cfeMergeNode in='SourceGraphic'/%3e%3cfeMergeNode in='c'/%3e%3c/feMerge%3e%3c/filter%3e%3cimage style='filter: url(%23b);' x='0' y='0' width='100%25' height='100%25' preserveAspectRatio='none' href='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAoKCgoKCgsMDAsPEA4QDxYUExMUFiIYGhgaGCIzICUgICUgMy03LCksNy1RQDg4QFFeT0pPXnFlZXGPiI+7u/sBCgoKCgoKCwwMCw8QDhAPFhQTExQWIhgaGBoYIjMgJSAgJSAzLTcsKSw3LVFAODhAUV5PSk9ecWVlcY+Ij7u7+//CABEIAAYACAMBIgACEQEDEQH/xAAnAAEBAAAAAAAAAAAAAAAAAAAABwEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAAmgP/xAAcEAACAQUBAAAAAAAAAAAAAAASFBMAAQMFERX/2gAIAQEAAT8AZ1HjrKZX55JysIc4Ff/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Af//Z'%3e%3c/image%3e%3c/svg%3e")`
      )
    }
  })

  it('should add a blur placeholder a statically imported png', async () => {
    const style = $('#blur-png').attr('style')
    if (isDev) {
      expect(style).toBe(
        `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("/docs/_next/image?url=%2Fdocs%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=8&q=70")`
      )
    } else {
      expect(style).toBe(
        `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' width='8' height='8'%3e%3cfilter id='b' color-interpolation-filters='sRGB'%3e%3cfeMorphology in='SourceAlpha' operator='dilate' radius='15' result='d'%3e%3c/feMorphology%3e%3cfeGaussianBlur in='d' stdDeviation='15' result='m'%3e%3c/feGaussianBlur%3e%3cfeGaussianBlur in='SourceGraphic' stdDeviation='1' result='b'%3e%3c/feGaussianBlur%3e%3cfeComponentTransfer in='b' result='s'%3e%3cfeFuncA type='table' tableValues='1 1'%3e%3c/feFuncA%3e%3c/feComponentTransfer%3e%3cfeComposite in2='m' in='s' operator='in' result='c'%3e%3c/feComposite%3e%3cfeMerge%3e%3cfeMergeNode in='SourceGraphic'/%3e%3cfeMergeNode in='c'/%3e%3c/feMerge%3e%3c/filter%3e%3cimage style='filter: url(%23b);' x='0' y='0' width='100%25' height='100%25' preserveAspectRatio='none' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAAAAADhZOFXAAAAOklEQVR42iWGsQkAIBDE0iuIdiLOJjiGIzjiL/Meb4okiNYIlLjK3hJMzCQG1/0qmXXOUkjAV+m9wAMe3QiV6Ne8VgAAAABJRU5ErkJggg=='%3e%3c/image%3e%3c/svg%3e")`
      )
    }
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
      "Module not found: Can't resolve '../public/foo/test-rect-broken.jpg"
    )
    // should contain the importing module
    expect(stderr).toContain('./pages/static-img.js')
    // should contain a import trace
    expect(stderr).not.toContain('Import trace for requested module')
  })
})
describe('Static Image Component Tests for basePath', () => {
  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      html = await renderViaHTTP(appPort, '/docs/static-img')
      $ = cheerio.load(html)
      browser = await webdriver(appPort, '/docs/static-img')
    })
    afterAll(() => {
      killApp(app)
    })
    runTests(false)
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      html = await renderViaHTTP(appPort, '/docs/static-img')
      $ = cheerio.load(html)
      browser = await webdriver(appPort, '/docs/static-img')
    })
    afterAll(() => {
      killApp(app)
    })
    runTests(true)
  })
})
