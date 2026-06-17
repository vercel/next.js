import { nextTestSetup, isNextDev, type Playwright } from 'e2e-utils'

describe('Build Error Tests for basePath', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (isNextDev) {
    it('no-op in dev', () => {})
    return
  }

  it('should throw build error when import statement is used with missing file', async () => {
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
        expect(cliOutput).toContain('pages/static-img.js')
      }
    )
  })
})

describe('Static Image Component Tests for basePath', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  let browser: Playwright
  let html: string

  beforeAll(async () => {
    html = await next.render('/docs/static-img')
    browser = await next.browser('/docs/static-img')
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

  it('Should use immutable cache-control header for static import', async () => {
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
  })

  if (!isNextDev) {
    it('Should use immutable cache-control header even when unoptimized', async () => {
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
    if (isTurbopack) {
      expect(html).toContain(
        `style="position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url(&quot;data:image/jpeg;base64`
      )
    } else {
      expect(html).toContain(
        `style="position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url(${
          isNextDev
            ? '&quot;/docs/_next/image?url=%2Fdocs%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&amp;w=8&amp;q=70&quot;'
            : '&quot;data:image/jpeg;base64,/9j/2wBDAAoKCgoKCgsMDAsPEA4QDxYUExMUFiIYGhgaGCIzICUgICUgMy03LCksNy1RQDg4QFFeT0pPXnFlZXGPiI+7u/v/2wBDAQoKCgoKCgsMDAsPEA4QDxYUExMUFiIYGhgaGCIzICUgICUgMy03LCksNy1RQDg4QFFeT0pPXnFlZXGPiI+7u/v/wgARCAAGAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAACUg//EABwQAAICAgMAAAAAAAAAAAAAABITERQAAwUVIv/aAAgBAQABPwB3H9YmrsuvN5+VxADn/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwB//9k=&quot;'
        })`
      )
    }
  })

  it('Should add a blur placeholder to statically imported png', async () => {
    if (isTurbopack) {
      expect(html).toContain(
        `style="position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url(&quot;data:image/png;base64`
      )
    } else {
      expect(html).toContain(
        `style="position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%;background-size:cover;background-position:0% 0%;filter:blur(20px);background-image:url(${
          isNextDev
            ? '&quot;/docs/_next/image?url=%2Fdocs%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&amp;w=8&amp;q=70&quot;'
            : '&quot;data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAMAAADz0U65AAAAElBMVEUAAAA6OjolJSWwsLAfHx/9/f2oxsg2AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAH0lEQVR4nGNgwAaYmKAMZmYIzcjKyghmsDAysmDTAgAEXAAhXbseDQAAAABJRU5ErkJggg==&quot;'
        })`
      )
    }
  })
})
