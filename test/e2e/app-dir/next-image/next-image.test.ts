import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir next-image',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    describe('ssr content', () => {
      it('should render images on / route', async () => {
        const $ = await next.render$('/')

        const layout = $('#app-layout')
        expect(layout.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
        )
        expect(layout.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
        )

        const page = $('#app-page')
        expect(page.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90'
        )
        expect(page.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=90 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90 2x'
        )

        const comp = $('#app-comp')
        expect(comp.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80'
        )
        expect(comp.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=80 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80 2x'
        )
      })

      it('should render images on /client route', async () => {
        const $ = await next.render$('/client')

        const root = $('#app-layout')
        expect(root.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
        )
        expect(root.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
        )

        const layout = $('#app-client-layout')
        expect(layout.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=55'
        )
        expect(layout.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=55 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=55 2x'
        )

        const page = $('#app-client-page')
        expect(page.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=60'
        )
        expect(page.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=60 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=60 2x'
        )

        const comp = $('#app-client-comp')
        expect(comp.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=50'
        )
        expect(comp.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=50 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=50 2x'
        )
      })

      it('should render images nested under page dir on /nested route', async () => {
        const $ = await next.render$('/nested')

        const root = $('#app-layout')
        expect(root.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
        )
        expect(root.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
        )

        const layout = $('#app-nested-layout')
        expect(layout.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=70'
        )
        expect(layout.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=70 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=70 2x'
        )

        const page = $('#app-nested-page')
        expect(page.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75'
        )
        expect(page.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=75 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75 2x'
        )

        const comp = $('#app-nested-comp')
        expect(comp.attr('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=65'
        )
        expect(comp.attr('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=65 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=65 2x'
        )
      })
    })

    describe('browser content', () => {
      it('should render images on / route', async () => {
        const browser = await next.browser('/')

        const layout = await browser.elementById('app-layout')
        expect(await layout.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
        )
        expect(await layout.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
        )

        const page = await browser.elementById('app-page')
        expect(await page.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90'
        )
        expect(await page.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=90 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90 2x'
        )

        const comp = await browser.elementById('app-comp')
        expect(await comp.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80'
        )
        expect(await comp.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=80 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80 2x'
        )
      })

      it('should render images on /client route', async () => {
        const browser = await next.browser('/client')

        const root = await browser.elementById('app-layout')
        expect(await root.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
        )
        expect(await root.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
        )

        const layout = await browser.elementById('app-client-layout')
        expect(await layout.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=55'
        )
        expect(await layout.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=55 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=55 2x'
        )

        const page = await browser.elementById('app-client-page')
        expect(await page.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=60'
        )
        expect(await page.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=60 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=60 2x'
        )

        const comp = await browser.elementById('app-client-comp')
        expect(await comp.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=50'
        )
        expect(await comp.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=50 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=50 2x'
        )
      })

      it('should render images nested under page dir on /nested route', async () => {
        const browser = await next.browser('/nested')

        const root = await browser.elementById('app-layout')
        expect(await root.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
        )
        expect(await root.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
        )

        const layout = await browser.elementById('app-nested-layout')
        expect(await layout.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=70'
        )
        expect(await layout.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=70 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=70 2x'
        )

        const page = await browser.elementById('app-nested-page')
        expect(await page.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75'
        )
        expect(await page.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=75 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75 2x'
        )

        const comp = await browser.elementById('app-nested-comp')
        expect(await comp.getAttribute('src')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=65'
        )
        expect(await comp.getAttribute('srcset')).toBe(
          '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=65 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=65 2x'
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
    })
  }
)
