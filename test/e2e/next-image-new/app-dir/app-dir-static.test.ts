import { nextTestSetup, isNextDev, type Playwright } from 'e2e-utils'
import cheerio from 'cheerio'

// The fixture page intentionally renders an uncached `await setTimeout(0)`
// without a Suspense boundary so that the priority image preload is committed
// into <head>. That pattern is incompatible with cache components mode, which
// errors on uncached runtime data outside of a Suspense boundary.
;(process.env.__NEXT_CACHE_COMPONENTS === 'true' ? describe.skip : describe)(
  'Build Error Tests',
  () => {
    const { next, isTurbopack, isRspack } = nextTestSetup({
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
        'app/static-img/page.js',
        (content) =>
          content.replace(
            '../../public/foo/test-rect.jpg',
            '../../public/foo/test-rect-broken.jpg'
          ),
        async () => {
          const { cliOutput } = await next.build()
          expect(cliOutput).toContain(
            "Module not found: Can't resolve '../../public/foo/test-rect-broken.jpg"
          )
          if (isTurbopack) {
            expect(cliOutput).toContain('app/static-img/page.js')
          } else {
            expect(cliOutput).toContain('./app/static-img/page.js')
          }
          if (!isRspack) {
            expect(cliOutput).not.toContain('Import trace for requested module')
          }
        }
      )
    })
  }
)
;(process.env.__NEXT_CACHE_COMPONENTS === 'true' ? describe.skip : describe)(
  'Static Image Component Tests',
  () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    let browser: Playwright
    let $: ReturnType<typeof cheerio.load>

    beforeAll(async () => {
      const html = await next.render('/static-img')
      $ = cheerio.load(html)
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
      expect(await browser.elementById('static-svg-fill')).toBeTruthy()
      expect(await browser.elementById('static-gif-fill')).toBeTruthy()
      expect(await browser.elementById('static-bmp-fill')).toBeTruthy()
      expect(await browser.elementById('static-ico-fill')).toBeTruthy()
      expect(await browser.elementById('static-unoptimized')).toBeTruthy()
    })

    if (!isNextDev) {
      it('Should use immutable cache-control header for static import', async () => {
        await browser.eval(
          `document.getElementById("basic-static").scrollIntoView()`
        )
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const url = await browser.eval(
          `document.getElementById("basic-static").src`
        )
        const res = await fetch(url)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toStartWith('image/')
        expect(res.headers.get('cache-control')).toBe(
          'public, max-age=315360000, immutable'
        )
      })

      it('Should use immutable cache-control header even when unoptimized', async () => {
        await browser.eval(
          `document.getElementById("static-unoptimized").scrollIntoView()`
        )
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const url = await browser.eval(
          `document.getElementById("static-unoptimized").src`
        )
        const res = await fetch(url)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toStartWith('image/')
        expect(res.headers.get('cache-control')).toBe(
          'public, max-age=31536000, immutable'
        )
      })
    }

    it('should have <head> containing <meta name="viewport"> followed by <link rel="preload"> for priority image', async () => {
      let metaViewport = { index: 0, attribs: {} as any }
      let linkPreload = { index: 0, attribs: {} as any }
      $('head')
        .children()
        .toArray()
        .forEach((child, index) => {
          const { tagName, attribs } = child
          if (tagName === 'meta' && attribs.name === 'viewport') {
            metaViewport = { index, attribs }
          } else if (
            tagName === 'link' &&
            attribs.rel === 'preload' &&
            attribs.as === 'image'
          ) {
            linkPreload = { index, attribs }
          }
        })
      expect(metaViewport.attribs.content).toContain('width=device-width')
      expect(linkPreload.attribs.imagesrcset).toMatch(
        /%2F_next%2Fstatic%2F(immutable%2F)?media%2Ftest-rect\.(.*)\.jpg/g
      )
      expect(metaViewport.index).toBeLessThan(linkPreload.index)
    })

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

    it('should add a data URL placeholder to an image', async () => {
      const style = $('#data-url-placeholder').attr('style')
      expect(style).toBe(
        `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItMjAwIiB0bz0iMjAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg==")`
      )
    })

    it('should add a blur placeholder a statically imported jpg', async () => {
      const style = $('#basic-static').attr('style')
      if (isNextDev) {
        if (isTurbopack) {
          expect(style).toContain(
            `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml`
          )
        } else {
          expect(style).toBe(
            `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest-rect.f323a148.jpg&w=8&q=70")`
          )
        }
      } else {
        if (isTurbopack) {
          expect(style).toContain(
            `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml`
          )
        } else {
          expect(style).toBe(
            `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 240'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='data:image/jpeg;base64,/9j/2wBDAAoKCgoKCgsMDAsPEA4QDxYUExMUFiIYGhgaGCIzICUgICUgMy03LCksNy1RQDg4QFFeT0pPXnFlZXGPiI+7u/v/2wBDAQoKCgoKCgsMDAsPEA4QDxYUExMUFiIYGhgaGCIzICUgICUgMy03LCksNy1RQDg4QFFeT0pPXnFlZXGPiI+7u/v/wgARCAAGAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAACUg//EABwQAAICAgMAAAAAAAAAAAAAABITERQAAwUVIv/aAAgBAQABPwB3H9YmrsuvN5+VxADn/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwB//9k='/%3E%3C/svg%3E")`
          )
        }
      }
    })

    it('should add a blur placeholder a statically imported png', async () => {
      const style = $('#blur-png').attr('style')
      if (isNextDev) {
        if (isTurbopack) {
          expect(style).toContain(
            `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml`
          )
        } else {
          expect(style).toBe(
            `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=8&q=70")`
          )
        }
      } else {
        if (isTurbopack) {
          expect(style).toContain(
            `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml`
          )
        } else {
          expect(style).toBe(
            `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAMAAADz0U65AAAAElBMVEUAAAA6OjolJSWwsLAfHx/9/f2oxsg2AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAH0lEQVR4nGNgwAaYmKAMZmYIzcjKyghmsDAysmDTAgAEXAAhXbseDQAAAABJRU5ErkJggg=='/%3E%3C/svg%3E")`
          )
        }
      }
    })

    it('should add a blur placeholder a statically imported png with fill', async () => {
      const style = $('#blur-png-fill').attr('style')
      if (isNextDev) {
        if (isTurbopack) {
          expect(style).toContain(
            `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml`
          )
        } else {
          expect(style).toBe(
            `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=8&q=70")`
          )
        }
      } else {
        if (isTurbopack) {
          expect(style).toContain(
            `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml`
          )
        } else {
          expect(style).toBe(
            `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAMAAADz0U65AAAAElBMVEUAAAA6OjolJSWwsLAfHx/9/f2oxsg2AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAH0lEQVR4nGNgwAaYmKAMZmYIzcjKyghmsDAysmDTAgAEXAAhXbseDQAAAABJRU5ErkJggg=='/%3E%3C/svg%3E")`
          )
        }
      }
    })

    it('should add placeholder with blurDataURL and fill', async () => {
      const style = $('#blurdataurl-fill').attr('style')
      expect(style).toBe(
        `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' %3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNM/s/wBwAFjwJgf8HDLgAAAABJRU5ErkJggg=='/%3E%3C/svg%3E")`
      )
    })

    it('should add placeholder even when blurDataURL aspect ratio does not match width/height ratio', async () => {
      const style = $('#blurdataurl-ratio').attr('style')
      expect(style).toBe(
        `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 200'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNM/s/wBwAFjwJgf8HDLgAAAABJRU5ErkJggg=='/%3E%3C/svg%3E")`
      )
    })

    it('should load direct imported image', async () => {
      const src = await browser.elementById('basic-static').getAttribute('src')
      expect(src).toMatch(
        /_next\/image\?url=%2F_next%2Fstatic(%2Fimmutable)?%2Fmedia%2Ftest-rect(.+)\.jpg&w=828&q=75/
      )
      const fullSrc = new URL(src, next.url)
      const res = await fetch(fullSrc)
      expect(res.status).toBe(200)
    })
  }
)
