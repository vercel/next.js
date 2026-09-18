import { nextTestSetup } from 'e2e-utils'

describe('app-dir - esm js extension', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

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

  async function getApiExportResults(pathname: string) {
    const $ = await next.render$(pathname)

    return Object.fromEntries(
      $('[data-api]')
        .map((_index, element) => ({
          name: $(element).attr('data-api'),
          passed: $(element).attr('data-passed') === 'true',
        }))
        .get()
        .map(({ name, passed }) => [name, passed])
    )
  }

  it('should preserve Pages Router API exports for ESM and CommonJS imports', async () => {
    const results = await getApiExportResults('/api-exports')

    expect(results).toEqual({
      app: true,
      cache: true,
      'compat/router': true,
      constants: true,
      document: true,
      dynamic: true,
      error: true,
      form: true,
      head: true,
      image: true,
      'legacy/image': true,
      link: true,
      navigation: true,
      offline: true,
      og: true,
      router: true,
      script: true,
      server: true,
      'web-vitals': true,
    })
  })

  it('should preserve App Router API exports for ESM and CommonJS imports', async () => {
    const results = await getApiExportResults('/app/api-exports')

    expect(results).toEqual({
      cache: true,
      'compat/router': true,
      constants: true,
      dynamic: true,
      form: true,
      head: true,
      headers: true,
      image: true,
      'legacy/image': true,
      link: true,
      navigation: true,
      offline: true,
      og: true,
      script: true,
      server: true,
      'web-vitals': true,
    })
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
})
