import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - next-image',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    describe('ssr content', () => {
      it('should render images on / route', async () => {
        const $ = await next.render$('/')

        const layout = $('#app-layout')

        if (process.env.TURBOPACK) {
          expect(layout.attr('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=85"`
          )
        } else {
          expect(layout.attr('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85"`
          )
        }

        if (process.env.TURBOPACK) {
          expect(layout.attr('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=85 2x"`
          )
        } else {
          expect(layout.attr('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x"`
          )
        }

        const page = $('#app-page')

        if (process.env.TURBOPACK) {
          expect(page.attr('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=90"`
          )
        } else {
          expect(page.attr('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90"`
          )
        }

        if (process.env.TURBOPACK) {
          expect(page.attr('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=640&q=90 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=90 2x"`
          )
        } else {
          expect(page.attr('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=90 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90 2x"`
          )
        }

        const comp = $('#app-comp')

        if (process.env.TURBOPACK) {
          expect(comp.attr('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=80"`
          )
        } else {
          expect(comp.attr('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80"`
          )
        }

        if (process.env.TURBOPACK) {
          expect(comp.attr('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=640&q=80 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=80 2x"`
          )
        } else {
          expect(comp.attr('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=80 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80 2x"`
          )
        }
      })

      it('should render images on /client route', async () => {
        const $ = await next.render$('/client')

        const root = $('#app-layout')
        expect(root.attr('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=85/
        )
        expect(root.attr('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=640&q=85 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=85 2x/
        )

        const layout = $('#app-client-layout')
        expect(layout.attr('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=55/
        )
        expect(layout.attr('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=640&q=55 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=55 2x/
        )

        const page = $('#app-client-page')
        expect(page.attr('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=60/
        )
        expect(page.attr('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=640&q=60 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=60 2x/
        )

        const comp = $('#app-client-comp')
        expect(comp.attr('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=50/
        )
        expect(comp.attr('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=640&q=50 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=50 2x/
        )
      })

      it('should render images nested under page dir on /nested route', async () => {
        const $ = await next.render$('/nested')

        const root = $('#app-layout')
        expect(root.attr('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=85/
        )
        expect(root.attr('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=640&q=85 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=85 2x/
        )

        const layout = $('#app-nested-layout')
        expect(layout.attr('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=70/
        )
        expect(layout.attr('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=640&q=70 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=70 2x/
        )

        const page = $('#app-nested-page')
        expect(page.attr('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=75/
        )
        expect(page.attr('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=640&q=75 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=75 2x/
        )

        const comp = $('#app-nested-comp')
        expect(comp.attr('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=65/
        )
        expect(comp.attr('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=640&q=65 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=65 2x/
        )
      })
    })

    describe('browser content', () => {
      it('should render images on / route', async () => {
        const browser = await next.browser('/')

        const layout = await browser.elementById('app-layout')

        if (process.env.TURBOPACK) {
          expect(await layout.getAttribute('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=85"`
          )
        } else {
          expect(await layout.getAttribute('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85"`
          )
        }

        if (process.env.TURBOPACK) {
          expect(await layout.getAttribute('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=85 2x"`
          )
        } else {
          expect(await layout.getAttribute('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x"`
          )
        }

        const page = await browser.elementById('app-page')

        if (process.env.TURBOPACK) {
          expect(await page.getAttribute('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=90"`
          )
        } else {
          expect(await page.getAttribute('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90"`
          )
        }

        if (process.env.TURBOPACK) {
          expect(await page.getAttribute('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=640&q=90 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=90 2x"`
          )
        } else {
          expect(await page.getAttribute('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=90 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90 2x"`
          )
        }

        const comp = await browser.elementById('app-comp')

        if (process.env.TURBOPACK) {
          expect(await comp.getAttribute('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=80"`
          )
        } else {
          expect(await comp.getAttribute('src')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80"`
          )
        }

        if (process.env.TURBOPACK) {
          expect(await comp.getAttribute('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=640&q=80 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=80 2x"`
          )
        } else {
          expect(await comp.getAttribute('srcset')).toMatchInlineSnapshot(
            `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=80 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80 2x"`
          )
        }
      })

      it('should render images nested under page dir on /nested route', async () => {
        const browser = await next.browser('/nested')

        const root = await browser.elementById('app-layout')
        expect(await root.getAttribute('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=85/
        )
        expect(await root.getAttribute('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=640&q=85 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.png&w=828&q=85 2x/
        )

        const layout = await browser.elementById('app-nested-layout')
        expect(await layout.getAttribute('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=70/
        )
        expect(await layout.getAttribute('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=640&q=70 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=70 2x/
        )

        const page = await browser.elementById('app-nested-page')
        expect(await page.getAttribute('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=75/
        )
        expect(await page.getAttribute('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=640&q=75 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=75 2x/
        )

        const comp = await browser.elementById('app-nested-comp')
        expect(await comp.getAttribute('src')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=65/
        )
        expect(await comp.getAttribute('srcset')).toMatch(
          /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=640&q=65 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.([^.]+)\.jpg&w=828&q=65 2x/
        )
      })
    })

    describe('image content', () => {
      it('should render images on / route', async () => {
        const $ = await next.render$('/')

        const res1 = await next.fetch($('#app-layout').attr('src'))
        expect(res1.status).toBe(200)
        expect(res1.headers.get('content-type')).toBe('image/png')

        const res2 = await next.fetch($('#app-page').attr('src'))
        expect(res2.status).toBe(200)
        expect(res2.headers.get('content-type')).toBe('image/png')

        const res3 = await next.fetch($('#app-comp').attr('src'))
        expect(res3.status).toBe(200)
        expect(res3.headers.get('content-type')).toBe('image/png')
      })

      it('should render images on /client route', async () => {
        const $ = await next.render$('/client')

        const res1 = await next.fetch($('#app-layout').attr('src'))
        expect(res1.status).toBe(200)
        expect(res1.headers.get('content-type')).toBe('image/png')

        const res2 = await next.fetch($('#app-client-layout').attr('src'))
        expect(res2.status).toBe(200)
        expect(res2.headers.get('content-type')).toBe('image/png')

        const res3 = await next.fetch($('#app-client-page').attr('src'))
        expect(res3.status).toBe(200)
        expect(res3.headers.get('content-type')).toBe('image/png')

        const res4 = await next.fetch($('#app-client-comp').attr('src'))
        expect(res4.status).toBe(200)
        expect(res4.headers.get('content-type')).toBe('image/png')
      })

      it('should render images nested under page dir on /nested route', async () => {
        const $ = await next.render$('/nested')

        const res1 = await next.fetch($('#app-layout').attr('src'))
        expect(res1.status).toBe(200)
        expect(res1.headers.get('content-type')).toBe('image/png')

        const res2 = await next.fetch($('#app-nested-layout').attr('src'))
        expect(res2.status).toBe(200)
        expect(res2.headers.get('content-type')).toBe('image/jpeg')

        const res3 = await next.fetch($('#app-nested-page').attr('src'))
        expect(res3.status).toBe(200)
        expect(res3.headers.get('content-type')).toBe('image/jpeg')

        const res4 = await next.fetch($('#app-nested-comp').attr('src'))
        expect(res4.status).toBe(200)
        expect(res4.headers.get('content-type')).toBe('image/jpeg')
      })

      it('should render legacy images under /legacy route', async () => {
        const $ = await next.render$('/legacy')

        const res2 = await next.fetch($('#app-legacy-layout').attr('src'))
        expect(res2.status).toBe(200)
        expect(res2.headers.get('content-type')).toBe('image/png')

        const res3 = await next.fetch($('#app-legacy-page').attr('src'))
        expect(res3.status).toBe(200)
        expect(res3.headers.get('content-type')).toBe('image/png')
      })

      it('should render legacy images in edge runtime on /legacy-edge-runtime route', async () => {
        const $ = await next.render$('/legacy-edge-runtime')

        const res2 = await next.fetch($('#app-legacy-edge-layout').attr('src'))
        expect(res2.status).toBe(200)
        expect(res2.headers.get('content-type')).toBe('image/png')

        const res3 = await next.fetch($('#app-legacy-edge-page').attr('src'))
        expect(res3.status).toBe(200)
        expect(res3.headers.get('content-type')).toBe('image/png')
      })
    })
  }
)
