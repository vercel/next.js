import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'Dynamic Route Interpolation',
  {
    files: __dirname,
  },
  ({ next, isNextStart }) => {
    it('should work', async () => {
      const $ = await next.render$('/blog/a')
      expect($('#slug').text()).toBe('a')
    })

    it('should work with parameter itself', async () => {
      const $ = await next.render$('/blog/[slug]')
      expect($('#slug').text()).toBe('[slug]')
    })

    it('should work with brackets', async () => {
      const $ = await next.render$('/blog/[abc]')
      expect($('#slug').text()).toBe('[abc]')
    })

    it('should work with parameter itself in API routes', async () => {
      const text = await next.render('/api/dynamic/[slug]')
      expect(text).toBe('slug: [slug]')
    })

    it('should work with brackets in API routes', async () => {
      const text = await next.render('/api/dynamic/[abc]')
      expect(text).toBe('slug: [abc]')
    })

    it('should bust data cache', async () => {
      const browser = await next.browser('/blog/login')
      await browser.elementById('now').click() // fetch data once
      const text = await browser.elementById('now').text()
      await browser.elementById('now').click() // fetch data again
      await browser.waitForElementByCss(`#now:not(:text("${text}"))`)
      await browser.close()
    })

    it('should bust data cache with symbol', async () => {
      const browser = await next.browser('/blog/@login')
      await browser.elementById('now').click() // fetch data once
      const text = await browser.elementById('now').text()
      await browser.elementById('now').click() // fetch data again
      await browser.waitForElementByCss(`#now:not(:text("${text}"))`)
      await browser.close()
    })

    if (isNextStart) {
      it('should support both encoded and decoded nextjs reserved path convention characters in path', async () => {
        const $ = await next.render$('/blog/123')
        let pagePathScriptSrc
        for (const script of $('script').toArray()) {
          const { src } = script.attribs
          if (src.includes('slug') && src.includes('pages/blog')) {
            pagePathScriptSrc = src
            break
          }
        }

        // e.g. /_next/static/chunks/pages/blog/%5Bslug%5D-3d2fedc300f04305.js
        const { status: encodedPathReqStatus } = await next.fetch(
          pagePathScriptSrc
        )
        // e.g. /_next/static/chunks/pages/blog/[slug]-3d2fedc300f04305.js
        const { status: decodedPathReqStatus } = await next.fetch(
          decodeURI(pagePathScriptSrc)
        )

        expect(encodedPathReqStatus).toBe(200)
        expect(decodedPathReqStatus).toBe(200)
      })
    }
  }
)
