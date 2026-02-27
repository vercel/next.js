import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import { join } from 'path'

describe('app dir - next-image', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('ssr content', () => {
    if (!isNextDeploy) {
      it('should handle HEAD requests for uncached images', async () => {
        const imagesDir = join(next.testDir, '.next/cache/images')
        await fs.remove(imagesDir).catch(() => {})

        const $ = await next.render$('/')
        const imageUrl = $('#app-layout').attr('src')

        const headRes = await next.fetch(imageUrl, { method: 'HEAD' })
        expect(headRes.status).toBe(200)
        expect(headRes.headers.get('content-type')).toMatch(/^image\//)
        expect(headRes.headers.get('X-Nextjs-Cache')).toBe('MISS')

        const contentLength = headRes.headers.get('content-length')
        expect(Number(contentLength || '0')).toBeGreaterThan(0)
        const headBody = await headRes.arrayBuffer()
        expect(headBody.byteLength).toBe(0)

        const getRes = await next.fetch(imageUrl)
        expect(getRes.status).toBe(200)
        expect(getRes.headers.get('content-type')).toMatch(/^image\//)
        expect(getRes.headers.get('X-Nextjs-Cache')).toBe('HIT')

        const getContentLength = getRes.headers.get('content-length')
        expect(Number(getContentLength || '0')).toBeGreaterThan(0)

        const getBody = await getRes.arrayBuffer()
        expect(getBody.byteLength).toBeGreaterThan(0)
        expect(getBody.byteLength).toBe(Number(getContentLength))
      })
    }

    it('should render images on / route', async () => {
      const $ = await next.render$('/')

      const layout = $('#app-layout')
      expect(stripTestHash(layout.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(layout.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=85${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)} 2x`
      )

      const page = $('#app-page')
      expect(stripTestHash(page.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=90${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(page.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=90${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=90${next.getAssetQuery(true)} 2x`
      )

      const comp = $('#app-comp')
      expect(stripTestHash(comp.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=80${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(comp.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=80${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=80${next.getAssetQuery(true)} 2x`
      )
    })

    it('should render images on /client route', async () => {
      const $ = await next.render$('/client')

      const root = $('#app-layout')
      expect(stripTestHash(root.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(root.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=85${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)} 2x`
      )

      const layout = $('#app-client-layout')
      expect(stripTestHash(layout.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=55${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(layout.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=55${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=55${next.getAssetQuery(true)} 2x`
      )

      const page = $('#app-client-page')
      expect(stripTestHash(page.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=60${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(page.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=60${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=60${next.getAssetQuery(true)} 2x`
      )

      const comp = $('#app-client-comp')
      expect(stripTestHash(comp.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=50${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(comp.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=50${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=50${next.getAssetQuery(true)} 2x`
      )
    })

    it('should render images nested under page dir on /nested route', async () => {
      const $ = await next.render$('/nested')

      const root = $('#app-layout')
      expect(stripTestHash(root.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(root.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=85${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)} 2x`
      )

      const layout = $('#app-nested-layout')
      expect(stripTestHash(layout.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=70${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(layout.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=640&q=70${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=70${next.getAssetQuery(true)} 2x`
      )

      const page = $('#app-nested-page')
      expect(stripTestHash(page.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=75${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(page.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=640&q=75${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=75${next.getAssetQuery(true)} 2x`
      )

      const comp = $('#app-nested-comp')
      expect(stripTestHash(comp.attr('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=65${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(comp.attr('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=640&q=65${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=65${next.getAssetQuery(true)} 2x`
      )
    })
  })

  describe('browser content', () => {
    it('should render images on / route', async () => {
      const browser = await next.browser('/')

      const layout = await browser.elementById('app-layout')
      expect(stripTestHash(await layout.getAttribute('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(await layout.getAttribute('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=85${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)} 2x`
      )

      const page = await browser.elementById('app-page')
      expect(stripTestHash(await page.getAttribute('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=90${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(await page.getAttribute('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=90${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=90${next.getAssetQuery(true)} 2x`
      )

      const comp = await browser.elementById('app-comp')
      expect(stripTestHash(await comp.getAttribute('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=80${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(await comp.getAttribute('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=80${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=80${next.getAssetQuery(true)} 2x`
      )
    })

    it('should render images nested under page dir on /nested route', async () => {
      const browser = await next.browser('/nested')

      const root = await browser.elementById('app-layout')
      expect(stripTestHash(await root.getAttribute('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(await root.getAttribute('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=640&q=85${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.png&w=828&q=85${next.getAssetQuery(true)} 2x`
      )

      const layout = await browser.elementById('app-nested-layout')
      expect(stripTestHash(await layout.getAttribute('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=70${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(await layout.getAttribute('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=640&q=70${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=70${next.getAssetQuery(true)} 2x`
      )

      const page = await browser.elementById('app-nested-page')
      expect(stripTestHash(await page.getAttribute('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=75${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(await page.getAttribute('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=640&q=75${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=75${next.getAssetQuery(true)} 2x`
      )

      const comp = await browser.elementById('app-nested-comp')
      expect(stripTestHash(await comp.getAttribute('src'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=65${next.getAssetQuery(true)}`
      )
      expect(stripTestHash(await comp.getAttribute('srcset'))).toBe(
        `/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=640&q=65${next.getAssetQuery(true)} 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=65${next.getAssetQuery(true)} 2x`
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
})

function stripTestHash(text: string) {
  return text.replace(/test\.[0-9a-f]{8,}\.(png|jpe?g)/g, 'test.HASH.$1')
}
