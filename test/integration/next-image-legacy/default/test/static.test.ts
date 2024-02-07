import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  File,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let app
let browser
let html

const indexPage = new File(join(appDir, 'pages/static-img.js'))

const runTests = () => {
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
  it('Should automatically provide an image height and width', async () => {
    expect(html).toContain('width:400px;height:300px')
  })
  it('Should allow provided width and height to override intrinsic', async () => {
    expect(html).toContain('width:200px;height:200px')
    expect(html).not.toContain('width:400px;height:400px')
  })
  it('Should add a blur placeholder to statically imported jpg', async () => {
    expect(html).toContain(
      `style="position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url(&quot;data:image/jpeg;base64,/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wgARCAAGAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGUB//EABYQAAMAAAAAAAAAAAAAAAAAAAMSE//aAAgBAQABBQJhQ//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABoQAAEFAQAAAAAAAAAAAAAAABIAARETMkH/2gAIAQEABj8CEHsLU8X/xAAYEAACAwAAAAAAAAAAAAAAAAAAEUFhcf/aAAgBAQABPyHSKKiP/9oADAMBAAIAAwAAABAD/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAGRAAAQUAAAAAAAAAAAAAAAAAEQAhMVHR/9oACAEBAAE/EMvICK3JX//Z&quot;)"`
    )
  })
  it('Should add a blur placeholder to statically imported png', async () => {
    expect(html).toContain(
      `style="position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url(&quot;data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAICAMAAAALMbVOAAAAFVBMVEUBAQEtLS1CQkIHBwf9/f21tbWurq5/IXexAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAHElEQVR4nGNggAJmJmYGJhYmBlYWNgZGRkaYMAACTwAjtdG5RQAAAABJRU5ErkJggg==&quot;)`
    )
  })

  it('should load direct imported image', async () => {
    const src = await browser.elementById('basic-static').getAttribute('src')
    expect(src).toMatch(
      /_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest-rect(.+)\.jpg&w=828&q=75/
    )
    const fullSrc = new URL(src, `http://localhost:${appPort}`)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load staticprops imported image', async () => {
    const src = await browser
      .elementById('basic-staticprop')
      .getAttribute('src')
    expect(src).toMatch(
      /_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Fexif-rotation(.+)\.jpg&w=256&q=75/
    )
    const fullSrc = new URL(src, `http://localhost:${appPort}`)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })
}

describe('Build Error Tests', () => {
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
      // should contain a import trace
      expect(stderr).not.toContain('Import trace for requested module')
    })
  })
})
describe('Static Image Component Tests', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      html = await renderViaHTTP(appPort, '/static-img')
      browser = await webdriver(appPort, '/static-img')
    })
    afterAll(() => {
      killApp(app)
    })
    runTests()
  })
})
