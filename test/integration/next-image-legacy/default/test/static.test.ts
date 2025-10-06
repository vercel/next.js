import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  File,
  waitFor,
} from 'next-test-utils'
import cheerio from 'cheerio'
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
    const $ = cheerio.load(html)
    if (process.env.IS_TURBOPACK_TEST) {
      expect($('#basic-static').attr('style')).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD/wAARCAAGAAgDAREAAhEBAxEB/9sAQwAKBwcIBwYKCAgICwoKCw4YEA4NDQ4dFRYRGCMfJSQiHyIhJis3LyYpNCkhIjBBMTQ5Oz4+PiUuRElDPEg3PT47/9sAQwEKCwsODQ4cEBAcOygiKDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyj7Rp39h/Zvscn9oefv8AtPmfLsxjZtx+Oc0Af//Z")"`
      )
    } else {
      expect($('#basic-static').attr('style')).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("data:image/jpeg;base64,/9j/2wBDAAoKCgoKCgsMDAsPEA4QDxYUExMUFiIYGhgaGCIzICUgICUgMy03LCksNy1RQDg4QFFeT0pPXnFlZXGPiI+7u/v/2wBDAQoKCgoKCgsMDAsPEA4QDxYUExMUFiIYGhgaGCIzICUgICUgMy03LCksNy1RQDg4QFFeT0pPXnFlZXGPiI+7u/v/wgARCAAGAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAACUg//EABwQAAICAgMAAAAAAAAAAAAAABITERQAAwUVIv/aAAgBAQABPwB3H9YmrsuvN5+VxADn/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwB//9k=")"`
      )
    }
  })
  it('Should add a blur placeholder to statically imported png', async () => {
    const $ = cheerio.load(html)
    if (process.env.IS_TURBOPACK_TEST) {
      expect($('#basic-static')[2].attribs.style).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAICAYAAAA870V8AAAARUlEQVR42l3MoQ0AQQhE0XG7xWwIJSBIKBRJOZRBEXOWnPjimQ8AXC3ce+nuPOcQEcHuppkRVcWZYWYSIkJV5XvvN9j4AFZHJTnjDHb/AAAAAElFTkSuQmCC")"`
      )
    } else {
      expect($('#basic-static')[2].attribs.style).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAICAMAAAALMbVOAAAAGFBMVEUBAQFCQkIHBwcuLi79/f0rKyu1tbWurq7lN1wyAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAHElEQVR4nGNggAImRiYGRhZGBjYWdgZmVmaYMAACVQAo1/LzagAAAABJRU5ErkJggg==")"`
      )
    }
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
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
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
        if (process.env.IS_TURBOPACK_TEST) {
          // For this test with Turbopack the root of the project is the root of the Next.js repository because it's not isolated.
          expect(stderr).toContain('pages/static-img.js')
        } else {
          expect(stderr).toContain('./pages/static-img.js')
        }
        // should contain a import trace
        expect(stderr).not.toContain('Import trace for requested module')
      })
    }
  )
})
describe('Static Image Component Tests', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
        html = await renderViaHTTP(appPort, '/static-img')
        browser = await webdriver(appPort, '/static-img')
      })
      afterAll(async () => {
        await killApp(app)
      })
      runTests()
    }
  )
})
