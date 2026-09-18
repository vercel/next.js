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

    return $('[data-api]')
      .map((_index, element) => ({
        api: $(element).attr('data-api'),
        passed: $(element).attr('data-passed'),
      }))
      .get()
  }

  it('should preserve Pages Router API exports for ESM and CommonJS imports', async () => {
    const results = await getApiExportResults('/api-exports')

    expect(results).toEqual([
      { api: 'app', passed: 'true' },
      { api: 'cache', passed: 'true' },
      { api: 'cache.js', passed: 'true' },
      { api: 'compat/router', passed: 'true' },
      { api: 'constants', passed: 'true' },
      { api: 'document', passed: 'true' },
      { api: 'dynamic', passed: 'true' },
      { api: 'error', passed: 'true' },
      { api: 'form', passed: 'true' },
      { api: 'head', passed: 'true' },
      { api: 'image', passed: 'true' },
      { api: 'legacy/image', passed: 'true' },
      { api: 'link', passed: 'true' },
      { api: 'navigation', passed: 'true' },
      { api: 'offline', passed: 'true' },
      { api: 'og', passed: 'true' },
      { api: 'router', passed: 'true' },
      { api: 'script', passed: 'true' },
      { api: 'server', passed: 'true' },
      { api: 'server.js', passed: 'true' },
      { api: 'web-vitals', passed: 'true' },
    ])
  })

  it('should preserve App Router API exports for ESM and CommonJS imports', async () => {
    const results = await getApiExportResults('/app/api-exports')

    expect(results).toEqual([
      { api: 'cache', passed: 'true' },
      { api: 'cache.js', passed: 'true' },
      { api: 'constants', passed: 'true' },
      { api: 'dynamic', passed: 'true' },
      { api: 'form', passed: 'true' },
      { api: 'head', passed: 'true' },
      { api: 'headers', passed: 'true' },
      { api: 'image', passed: 'true' },
      { api: 'legacy/image', passed: 'true' },
      { api: 'link', passed: 'true' },
      { api: 'navigation', passed: 'true' },
      { api: 'offline', passed: 'true' },
      { api: 'og', passed: 'true' },
      { api: 'script', passed: 'true' },
      { api: 'server', passed: 'true' },
      { api: 'server.js', passed: 'true' },
    ])
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
