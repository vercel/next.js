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
         "app": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "cache": "default namespace-default",
         "client": "default namespace-default",
         "compat/router": "default namespace-default",
         "constants": "default namespace-default",
         "document": "default namespace-default default-callable",
         "dynamic": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "error": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "form": "default namespace-default cjs-is-own-default",
         "head": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "image": "default namespace-default",
         "legacy/image": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "link": "default namespace-default cjs-is-own-default",
         "navigation": "default namespace-default",
         "offline": "default namespace-default",
         "og": "default namespace-default",
         "script": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "server": "default namespace-default",
         "web-vitals": "default namespace-default",
       }
      `)
    } else {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "app": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "cache": "default",
         "client": "",
         "compat/router": "",
         "constants": "",
         "document": "default namespace-default default-callable",
         "dynamic": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "error": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "form": "default namespace-default cjs-is-own-default",
         "head": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "image": "default namespace-default",
         "legacy/image": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "link": "default namespace-default cjs-is-own-default",
         "navigation": "",
         "offline": "",
         "og": "",
         "script": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "server": "",
         "web-vitals": "",
       }
      `)
    }
  })

  it('should preserve react-server layer API exports for ESM and CommonJS imports', async () => {
    const shapes = await getApiExportShapes('/app/api-exports', 'react-server')

    if (isTurbopack) {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "cache": "default namespace-default",
         "constants": "default namespace-default",
         "dynamic": "default namespace-default default-callable cjs-callable cjs-is-own-default absent-markers:noSSR",
         "error": "",
         "form": "default namespace-default default-callable",
         "head": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "headers": "namespace-default",
         "image": "default namespace-default default-callable",
         "legacy/image": "default namespace-default default-callable",
         "link": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "navigation": "",
         "og": "default namespace-default",
         "script": "default namespace-default default-callable absent-markers:handleClientScriptLoad,initScriptLoader",
         "server": "default namespace-default",
       }
      `)
    } else {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "cache": "default",
         "constants": "",
         "dynamic": "default namespace-default default-callable absent-markers:noSSR",
         "error": "",
         "form": "default namespace-default default-callable",
         "head": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "headers": "",
         "image": "default namespace-default default-callable",
         "legacy/image": "default namespace-default default-callable",
         "link": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "navigation": "",
         "og": "",
         "script": "default namespace-default default-callable absent-markers:handleClientScriptLoad,initScriptLoader",
         "server": "",
       }
      `)
    }
  })

  it('should preserve client layer API exports for ESM and CommonJS imports', async () => {
    const shapes = await getApiExportShapes('/app/api-exports', 'client')

    if (isTurbopack) {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "cache": "default namespace-default",
         "client": "default namespace-default",
         "compat/router": "default namespace-default",
         "error": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "navigation": "default namespace-default",
         "offline": "default namespace-default",
         "web-vitals": "default namespace-default",
       }
      `)
    } else {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "cache": "default",
         "client": "",
         "compat/router": "",
         "error": "default namespace-default default-callable",
         "navigation": "",
         "offline": "",
         "web-vitals": "",
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
         "cache": "default namespace-default",
         "client": "default namespace-default",
         "compat/router": "default namespace-default",
         "error": "default namespace-default default-callable cjs-callable cjs-is-own-default",
         "navigation": "default namespace-default",
         "offline": "default namespace-default",
         "web-vitals": "default namespace-default",
       }
      `)
    } else {
      expect(shapes).toMatchInlineSnapshot(`
       {
         "cache": "default",
         "client": "",
         "compat/router": "",
         "error": "default namespace-default default-callable",
         "navigation": "",
         "offline": "",
         "web-vitals": "",
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
