/* eslint-disable jest/no-standalone-expect */
import {
  nextTestSetup,
  isNextDev,
  isNextStart,
  type Playwright,
} from 'e2e-utils'
import cheerio from 'cheerio'

describe('Build Error Tests', () => {
  const { next, isTurbopack, isRspack, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (isNextDeploy) return
  ;(isNextStart ? it : it.skip)(
    'should throw build error when import statement is used with missing file',
    async () => {
      await next.patchFile(
        'pages/static-img.js',
        (content) =>
          content.replace(
            '../public/foo/test-rect.jpg',
            '../public/foo/test-rect-broken.jpg'
          ),
        async () => {
          const { cliOutput } = await next.build()
          expect(cliOutput).toContain(
            "Module not found: Can't resolve '../public/foo/test-rect-broken.jpg"
          )
          if (isTurbopack) {
            expect(cliOutput).toContain('pages/static-img.js')
          } else {
            expect(cliOutput).toContain('./pages/static-img.js')
          }
          if (!isRspack) {
            expect(cliOutput).not.toContain('Import trace for requested module')
          }
        }
      )
    }
  )
})

describe('Static Image Component Tests', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  let browser: Playwright
  let html: string

  beforeAll(async () => {
    html = await next.render('/static-img')
    browser = await next.browser('/static-img')
  })

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
  ;(isNextStart ? it : it.skip)(
    'Should use immutable cache-control header for static import',
    async () => {
      await browser.eval(
        `document.getElementById("basic-static").scrollIntoView()`
      )
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const url = await browser.eval(
        `document.getElementById("basic-static").src`
      )
      const res = await fetch(url)
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=315360000, immutable'
      )
    }
  )
  ;(isNextStart ? it : it.skip)(
    'Should use immutable cache-control header even when unoptimized',
    async () => {
      await browser.eval(
        `document.getElementById("static-unoptimized").scrollIntoView()`
      )
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const url = await browser.eval(
        `document.getElementById("static-unoptimized").src`
      )
      const res = await fetch(url)
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      )
    }
  )

  it('Should automatically provide an image height and width', async () => {
    expect(html).toContain('width:400px;height:300px')
  })

  it('Should allow provided width and height to override intrinsic', async () => {
    expect(html).toContain('width:200px;height:200px')
    expect(html).not.toContain('width:400px;height:400px')
  })

  it('Should add a blur placeholder to statically imported jpg', async () => {
    const $ = cheerio.load(html)
    const style = $('#basic-static').attr('style')
    if (isTurbopack) {
      expect(replaceDataUrl(style)).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("data:<REPLACED>")"`
      )
    } else if (isNextDev) {
      // In webpack dev, `next/legacy/image` emits a dynamic blur URL via the
      // image optimizer route instead of an inlined base64 data URL, to avoid
      // slowing down the dev server (see
      // `packages/next/src/build/webpack/loaders/next-image-loader/blur.ts`).
      expect(replaceBlurUrl(style)).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("<REPLACED_BLUR_URL>")"`
      )
    } else {
      expect(replaceDataUrl(style)).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("data:<REPLACED>")"`
      )
    }
  })

  it('Should add a blur placeholder to statically imported png', async () => {
    const $ = cheerio.load(html)
    const style = $('#basic-static')[2].attribs.style
    if (isTurbopack) {
      expect(style).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAICAYAAAA870V8AAAARUlEQVR42l3MoQ0AQQhE0XG7xWwIJSBIKBRJOZRBEXOWnPjimQ8AXC3ce+nuPOcQEcHuppkRVcWZYWYSIkJV5XvvN9j4AFZHJTnjDHb/AAAAAElFTkSuQmCC")"`
      )
    } else if (isNextDev) {
      // In webpack dev, `next/legacy/image` emits a dynamic blur URL via the
      // image optimizer route instead of an inlined base64 data URL, to avoid
      // slowing down the dev server (see
      // `packages/next/src/build/webpack/loaders/next-image-loader/blur.ts`).
      expect(replaceBlurUrl(style)).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("<REPLACED_BLUR_URL>")"`
      )
    } else {
      // In webpack start, the exact base64 output of the blur placeholder
      // depends on the environment's sharp/libvips version, so normalize the
      // data URL contents to only assert the data URL prefix.
      expect(replaceDataUrl(style)).toMatchInlineSnapshot(
        `"position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url("data:<REPLACED>")"`
      )
    }
  })

  it('should load direct imported image', async () => {
    const src = await browser.elementById('basic-static').getAttribute('src')
    expect(src).toMatch(
      /_next\/image\?url=%2F_next%2Fstatic%2F(immutable%2F)?media%2Ftest-rect(.+)\.jpg&w=828&q=75/
    )
    const fullSrc = new URL(src, next.url)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load staticprops imported image', async () => {
    const src = await browser
      .elementById('basic-staticprop')
      .getAttribute('src')
    expect(src).toMatch(
      /_next\/image\?url=%2F_next%2Fstatic%2F(immutable%2F)?media%2Fexif-rotation(.+)\.jpg&w=256&q=75/
    )
    const fullSrc = new URL(src, next.url)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })
})

function replaceDataUrl(styles) {
  return styles.replace(/url\("data:[^"]+"\)/g, 'url("data:<REPLACED>")')
}

// Webpack dev emits a dynamic blur URL that points at the image optimizer
// route, e.g. `/_next/image?url=...&w=8&q=70`. Normalize it so the snapshot
// only asserts the style shape, not the encoded src.
function replaceBlurUrl(styles) {
  return styles.replace(
    /url\("\/_next\/image\?[^"]+"\)/g,
    'url("<REPLACED_BLUR_URL>")'
  )
}
