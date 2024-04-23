import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir - esm js extension',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should be able to render nextjs api in app router', async () => {
      const $ = await next.render$('/app')

      async function validateDomNodes(selector: string) {
        expect(await $(`${selector} .img`).prop('tagName')).toBe('IMG')
        expect(await $(`${selector} .link`).prop('tagName')).toBe('A')
        expect(await $(`${selector} .typeof-getImageProps`).text()).toContain(
          'function'
        )
      }

      await validateDomNodes('#with-ext')
      await validateDomNodes('#without-ext')

      expect($('head link[href="/test-ext.js"]').length).toBe(1)
      expect($('head link[href="/test.js"]').length).toBe(1)
    })

    it('should be able to use nextjs api in pages router', async () => {
      const $ = await next.render$('/pages')

      expect(await $('meta[name="head-value-1"]').attr('content')).toBe(
        'with-ext'
      )
      expect(await $('meta[name="head-value-2"]').attr('content')).toBe(
        'without-ext'
      )
      expect(await $('.root').text()).toContain('pages')
    })

    it('should support next/og image', async () => {
      const res = await next.fetch('/opengraph-image')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
    })
  }
)
