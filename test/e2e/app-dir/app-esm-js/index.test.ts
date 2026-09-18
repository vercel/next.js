import { nextTestSetup } from 'e2e-utils'

describe('app-dir - esm js extension', () => {
  const { next, isTurbopack } = nextTestSetup({
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

  // Each entry records which module a `next/*` entrypoint resolved to in a given
  // layer, so a change in aliasing or in what an entry exports shows up as a
  // diff rather than a silent pass. `default` is the `import x from` binding,
  // `namespace-default` the namespace's `default`, `absent-markers` any expected
  // export the entry is missing, and `missing-from-cjs` any named export the
  // CommonJS form lacks.
  async function getApiExportShapes(pathname: string, layer?: string) {
    const $ = await next.render$(pathname)
    const selector = layer ? `[data-layer="${layer}"]` : '[data-api]'

    const entries = $(selector)
      .map((_index, element) => ({
        name: $(element).attr('data-api'),
        shape: $(element).attr('data-shape'),
      }))
      .get()

    expect(entries.length).toBeGreaterThan(0)

    return Object.fromEntries(entries.map(({ name, shape }) => [name, shape]))
  }

  it('should not expose client-only navigation hooks in the react-server layer', async () => {
    const $ = await next.render$('/app/api-exports')
    const leaked = $('[data-leaked-client-navigation]')

    expect(leaked.length).toBe(1)
    // `next/navigation` must resolve to `navigation.react-server` here, which
    // omits the client hooks entirely.
    expect(leaked.attr('data-leaked-client-navigation')).toBe('')
  })

  it('should preserve Pages Router API exports for ESM and CommonJS imports', async () => {
    const shapes = await getApiExportShapes('/api-exports')

    if (isTurbopack) {
      expect(shapes).toMatchInlineSnapshot(`
            {
              "app": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "cache": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "client": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "compat/router": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "constants": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "document": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "dynamic": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "error": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "form": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "head": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "image": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "legacy/image": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "link": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "navigation": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "offline": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "og": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "script": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "server": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "web-vitals": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
            }
            `)
    } else {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "app": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "cache": "default:yes namespace-default:no absent-markers: missing-from-cjs:",
         "client": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "compat/router": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "constants": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "document": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "dynamic": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "error": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "form": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "head": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "image": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "legacy/image": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "link": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "navigation": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "offline": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "og": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "script": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "server": "default:yes namespace-default:no absent-markers: missing-from-cjs:",
         "web-vitals": "default:no namespace-default:no absent-markers: missing-from-cjs:",
       }
      `)
    }
  })

  it('should preserve react-server layer API exports for ESM and CommonJS imports', async () => {
    const shapes = await getApiExportShapes('/app/api-exports', 'react-server')

    if (isTurbopack) {
      expect(shapes).toMatchInlineSnapshot(`
            {
              "cache": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "constants": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "dynamic": "default:yes namespace-default:yes absent-markers:noSSR missing-from-cjs:",
              "error": "default:no namespace-default:no absent-markers: missing-from-cjs:",
              "form": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "head": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "headers": "default:no namespace-default:yes absent-markers: missing-from-cjs:",
              "image": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "legacy/image": "default:yes namespace-default:yes absent-markers: missing-from-cjs:then,catch,finally",
              "link": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "navigation": "default:no namespace-default:no absent-markers: missing-from-cjs:",
              "og": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "script": "default:yes namespace-default:yes absent-markers:handleClientScriptLoad,initScriptLoader missing-from-cjs:then,catch,finally",
              "server": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
            }
            `)
    } else {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "cache": "default:yes namespace-default:no absent-markers: missing-from-cjs:",
         "constants": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "dynamic": "default:yes namespace-default:yes absent-markers:noSSR missing-from-cjs:",
         "error": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "form": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "head": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "headers": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "image": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "legacy/image": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "link": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "navigation": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "og": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "script": "default:yes namespace-default:yes absent-markers:handleClientScriptLoad,initScriptLoader missing-from-cjs:",
         "server": "default:no namespace-default:no absent-markers: missing-from-cjs:",
       }
      `)
    }
  })

  it('should preserve client layer API exports for ESM and CommonJS imports', async () => {
    const shapes = await getApiExportShapes('/app/api-exports', 'client')

    if (isTurbopack) {
      expect(shapes).toMatchInlineSnapshot(`
            {
              "cache": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "client": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "compat/router": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "error": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "navigation": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "offline": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "web-vitals": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
            }
            `)
    } else {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "cache": "default:yes namespace-default:no absent-markers: missing-from-cjs:",
         "client": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "compat/router": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "error": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "navigation": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "offline": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "web-vitals": "default:no namespace-default:no absent-markers: missing-from-cjs:",
       }
      `)
    }
  })

  it('should preserve browser API exports for ESM and CommonJS imports', async () => {
    const browser = await next.browser('/app/api-exports')
    const shapes = await browser.eval(() =>
      Object.fromEntries(
        Array.from(
          document.querySelectorAll('[data-layer="client"]'),
          (element) => [
            element.getAttribute('data-api'),
            element.getAttribute('data-shape'),
          ]
        )
      )
    )

    if (isTurbopack) {
      expect(shapes).toMatchInlineSnapshot(`
            {
              "cache": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "client": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "compat/router": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "error": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "navigation": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "offline": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
              "web-vitals": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
            }
            `)
    } else {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "cache": "default:yes namespace-default:no absent-markers: missing-from-cjs:",
         "client": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "compat/router": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "error": "default:yes namespace-default:yes absent-markers: missing-from-cjs:",
         "navigation": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "offline": "default:no namespace-default:no absent-markers: missing-from-cjs:",
         "web-vitals": "default:no namespace-default:no absent-markers: missing-from-cjs:",
       }
      `)
    }
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
