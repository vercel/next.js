import path from 'path'
import { check } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

// TODO: We should decide on an established pattern for gating test assertions
// on experimental flags. For example, as a first step we could all the common
// gates like this one into a single module.
const isPPREnabledByDefault = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

async function resolveStreamResponse(response: any, onData?: any) {
  let result = ''
  onData = onData || (() => {})

  for await (const chunk of response.body) {
    result += chunk.toString()
    onData(chunk.toString(), result)
  }
  return result
}

describe('app dir - rsc basics', () => {
  const { next, isNextDev, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
    resolutions: {
      '@babel/core': '7.22.18',
      '@babel/parser': '7.22.16',
      '@babel/types': '7.22.17',
      '@babel/traverse': '7.22.18',
    },
  })

  if (isNextDev && !isTurbopack) {
    it('should have correct client references keys in manifest', async () => {
      await next.render('/')
      await check(async () => {
        // Check that the client-side manifest is correct before any requests
        const clientReferenceManifest = JSON.parse(
          (
            await next.readFile(
              '.next/server/app/page_client-reference-manifest.js'
            )
          ).match(/]=(.+)$/)[1]
        )
        const clientModulesNames = Object.keys(
          clientReferenceManifest.clientModules
        )
        clientModulesNames.every((name) => {
          const [, key] = name.split('#', 2)
          return key === undefined || key === '' || key === 'default'
        })

        return 'success'
      }, 'success')
    })
  }

  describe('next internal shared context', () => {
    it('should not error if just load next/navigation module in pages/api', async () => {
      const res = await next.fetch('/api/navigation')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('just work')
    })

    it('should not error if just load next/router module in app page', async () => {
      const res = await next.fetch('/shared-context/server')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('just work')
    })
  })

  it('should correctly render page returning null', async () => {
    const homeHTML = await next.render('/return-null/page')
    const $ = cheerio.load(homeHTML)
    expect($('#return-null-layout').html()).toBeEmpty()
  })

  it('should correctly render component returning null', async () => {
    const homeHTML = await next.render('/return-null/component')
    const $ = cheerio.load(homeHTML)
    expect($('#return-null-layout').html()).toBeEmpty()
  })

  it('should correctly render layout returning null', async () => {
    const homeHTML = await next.render('/return-null/layout')
    const $ = cheerio.load(homeHTML)
    expect($('#return-null-layout').html()).toBeEmpty()
  })

  it('should correctly render page returning undefined', async () => {
    const homeHTML = await next.render('/return-undefined/page')
    const $ = cheerio.load(homeHTML)
    expect($('#return-undefined-layout').html()).toBeEmpty()
  })

  it('should correctly render component returning undefined', async () => {
    const homeHTML = await next.render('/return-undefined/component')
    const $ = cheerio.load(homeHTML)
    expect($('#return-undefined-layout').html()).toBeEmpty()
  })

  it('should correctly render layout returning undefined', async () => {
    const homeHTML = await next.render('/return-undefined/layout')
    const $ = cheerio.load(homeHTML)
    expect($('#return-undefined-layout').html()).toBeEmpty()
  })

  it('should handle named client components imported as page', async () => {
    const $ = await next.render$('/reexport-named')
    expect($('#client-title').text()).toBe('Client Title')
  })

  it('should handle client components imported as namespace', async () => {
    const $ = await next.render$('/reexport-namespace')
    expect($('#foo').text()).toBe('Foo')
  })

  it('should render server components correctly', async () => {
    const homeHTML = await next.render('/', null, {
      headers: {
        'x-next-test-client': 'test-util',
      },
    })

    // should have only 1 DOCTYPE
    expect(homeHTML).toMatch(/^<!DOCTYPE html><html/)
    // should have default metadata when there's nothing additional provided
    expect(homeHTML).toContain('<meta charSet="utf-8"/>')
    expect(homeHTML).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
    )

    expect(homeHTML).toContain('header:test-util')

    const inlineFlightContents = []
    const $ = cheerio.load(homeHTML)
    expect($('h1').text()).toBe('component:index.server')
    $('script').each((_index, tag) => {
      const content = $(tag).text()
      if (content) inlineFlightContents.push(content)
    })

    const internalQueries = [
      '__nextFallback',
      '__nextLocale',
      '__nextDefaultLocale',
      '__nextIsNotFound',
    ]

    const hasNextInternalQuery = inlineFlightContents.some((content) =>
      internalQueries.some((query) => content.includes(query))
    )
    expect(hasNextInternalQuery).toBe(false)
    expect(next.cliOutput).not.toContain(
      'Each child in a list should have a unique "key" prop'
    )
  })

  it('should reuse the inline flight response without sending extra requests', async () => {
    let hasFlightRequest = false
    let requestsCount = 0
    await next.browser('/root', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          requestsCount++
          return request.allHeaders().then((headers) => {
            if (
              headers['RSC'.toLowerCase()] === '1' &&
              // Prefetches also include `RSC`
              headers['Next-Router-Prefetch'.toLowerCase()] !== '1'
            ) {
              hasFlightRequest = true
            }
          })
        })
      },
    })

    expect(requestsCount).toBeGreaterThan(0)
    expect(hasFlightRequest).toBe(false)
  })

  it('should support multi-level server component imports', async () => {
    const html = await next.render('/multi')
    expect(html).toContain('bar.server.js:')
    expect(html).toContain('foo.client')
  })

  it('should create client reference successfully for all file conventions', async () => {
    const html = await next.render('/conventions')
    expect(html).toContain('it works')
  })

  it('should be able to navigate between rsc routes', async () => {
    const browser = await next.browser('/root')

    await browser.waitForElementByCss('#goto-next-link').click()
    await new Promise((res) => setTimeout(res, 1000))
    await check(() => browser.url(), `${next.url}/next-api/link`)
    await browser.waitForElementByCss('#goto-home').click()
    await new Promise((res) => setTimeout(res, 1000))
    await check(() => browser.url(), `${next.url}/root`)
    const content = await browser.elementByCss('body').text()
    expect(content).toContain('component:root.server')

    await browser.waitForElementByCss('#goto-streaming-rsc').click()

    // Wait for navigation and streaming to finish.
    await check(
      () => browser.elementByCss('#content').text(),
      'next_streaming_data'
    )
    expect(await browser.url()).toBe(`${next.url}/streaming-rsc`)
  })

  it('should handle streaming server components correctly', async () => {
    const browser = await next.browser('/streaming-rsc')
    const content = await browser.eval(
      `document.querySelector('#content').innerText`
    )
    expect(content).toMatchInlineSnapshot('"next_streaming_data"')
  })

  it('should track client components in dynamic imports', async () => {
    const html = await next.render('/dynamic')
    expect(html).toContain('dynamic data!')
  })

  describe.each(['node', 'edge'])(
    'client references with TLA (%s)',
    (runtime) => {
      let url = `/async-client${runtime === 'edge' ? '/edge' : ''}`

      it('should support TLA in sync client reference imports', async () => {
        const html = await next.render(url + '/sync')
        expect(html).toContain('client async')
      })

      it('should support TLA in lazy client reference', async () => {
        const html = await next.render(url + '/lazy')
        expect(html).toContain('client async')
      })
    }
  )

  if (isPPREnabledByDefault) {
    // TODO: Figure out why this test is flaky when PPR is enabled
  } else {
    it('should support next/link in server components', async () => {
      const $ = await next.render$('/next-api/link')
      const linkText = $('body a[href="/root"]').text()

      expect(linkText).toContain('home')

      const browser = await next.browser('/next-api/link')

      // We need to make sure the app is fully hydrated before clicking, otherwise
      // it will be a full redirection instead of being taken over by the next
      // router. This timeout prevents it being flaky caused by fast refresh's
      // rebuilding event.
      await new Promise((res) => setTimeout(res, 1000))
      await browser.eval('window.beforeNav = 1')

      await browser.waitForElementByCss('#next_id').click()
      await check(() => browser.elementByCss('#query').text(), 'query:1')

      await browser.waitForElementByCss('#next_id').click()
      await check(() => browser.elementByCss('#query').text(), 'query:2')

      if (isNextDev) {
        expect(await browser.eval('window.beforeNav')).toBe(1)
      }
    })
  }

  it('should link correctly with next/link without mpa navigation to the page', async () => {
    // Select the button which is not hidden but rendered
    const selector = '#goto-next-link'
    const browser = await next.browser('/root', {})

    await browser.eval('window.didNotReloadPage = true')
    await browser.elementByCss(selector).click().waitForElementByCss('#query')

    expect(await browser.eval('window.didNotReloadPage')).toBe(true)

    const text = await browser.elementByCss('#query').text()
    expect(text).toBe('query:0')
  })

  it('should escape streaming data correctly', async () => {
    const browser = await next.browser('/escaping-rsc')
    const manipulated = await browser.eval(`window.__manipulated_by_injection`)
    expect(manipulated).toBe(undefined)
  })

  it('should render built-in 404 page for missing route if pagesDir is not presented', async () => {
    const res = await next.fetch('/does-not-exist')

    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html).toContain('This page could not be found')
  })

  it('should suspense next/legacy/image in server components', async () => {
    const $ = await next.render$('/next-api/image-legacy')
    const imageTag = $('#myimg')

    expect(imageTag.attr('src')).toContain('data:image')
  })

  it('should suspense next/image in server components', async () => {
    const $ = await next.render$('/next-api/image-new')
    const imageTag = $('#myimg')

    expect(imageTag.attr('src')).toMatch(/test.+jpg/)
  })

  it('should handle various kinds of exports correctly', async () => {
    const $ = await next.render$('/various-exports')
    const content = $('body').text()

    expect(content).toContain('abcde')
    expect(content).toContain('default-export-arrow.client')
    expect(content).toContain('named.client')

    const browser = await next.browser('/various-exports')
    const hydratedContent = await browser.waitForElementByCss('body').text()

    expect(hydratedContent).toContain('abcde')
    expect(hydratedContent).toContain('default-export-arrow.client')
    expect(hydratedContent).toContain('named.client')
    expect(hydratedContent).toContain('cjs-shared')
    expect(hydratedContent).toContain('cjs-client')
    expect(hydratedContent).toContain('Export All: one, two, two')
  })

  it('should support native modules in server component', async () => {
    const $ = await next.render$('/native-module')
    const content = $('body').text()

    expect(content).toContain('fs: function')
    expect(content).toContain('foo.client')
  })

  it('should resolve different kinds of components correctly', async () => {
    const $ = await next.render$('/shared')
    const main = $('#main').html()
    const content = $('#bar').text()

    // Should have 5 occurrences of "client_component".
    expect(Array.from(main.matchAll(/client_component/g)).length).toBe(5)

    // Should have 2 occurrences of "shared:server", and 2 occurrences of
    // "shared:client".
    const sharedServerModule = Array.from(main.matchAll(/shared:server:(\d+)/g))
    const sharedClientModule = Array.from(main.matchAll(/shared:client:(\d+)/g))
    expect(sharedServerModule.length).toBe(2)
    expect(sharedClientModule.length).toBe(2)

    // Should have 2 modules created for the shared component.
    expect(sharedServerModule[0][1]).toBe(sharedServerModule[1][1])
    expect(sharedClientModule[0][1]).toBe(sharedClientModule[1][1])
    expect(sharedServerModule[0][1]).not.toBe(sharedClientModule[0][1])
    expect(content).toContain('bar.server.js:')
  })

  it('should stick to the url without trailing /page suffix', async () => {
    const browser = await next.browser('/edge/dynamic')
    const indexUrl = await browser.url()

    await browser.loadPage(`${next.url}/edge/dynamic/123`, {
      disableCache: false,
      beforePageLoad: null,
    })

    const dynamicRouteUrl = await browser.url()
    expect(indexUrl).toBe(`${next.url}/edge/dynamic`)
    expect(dynamicRouteUrl).toBe(`${next.url}/edge/dynamic/123`)
  })

  it('should support streaming for flight response', async () => {
    await next
      .fetch('/', {
        headers: { RSC: '1' },
      })
      .then(async (response) => {
        const result = await resolveStreamResponse(response)
        expect(result).toContain('component:index.server')
        if (isNextDev) {
          expect(result).toContain('"b":"development"')
        } else {
          expect(result).toMatch(/"b":".*?"/)
        }
      })
  })

  it('should support partial hydration with inlined server data', async () => {
    await next.fetch('/partial-hydration').then(async (response) => {
      let gotFallback = false
      let gotData = false
      let gotInlinedData = false

      await resolveStreamResponse(response, (_, result) => {
        gotInlinedData = result.includes('self.__next_f=')
        gotData = result.includes('next_streaming_data')
        if (!gotFallback) {
          gotFallback = result.includes('next_streaming_fallback')
          if (gotFallback) {
            expect(gotData).toBe(false)
            // TODO-APP: investigate the failing test
            // expect(gotInlinedData).toBe(false)
          }
        }
      })

      expect(gotFallback).toBe(true)
      expect(gotData).toBe(true)
      expect(gotInlinedData).toBe(true)
    })
  })

  it('should not apply rsc syntax checks in pages/api', async () => {
    const res = await next.fetch('/api/import-test')
    expect(await res.text()).toBe('Hello from import-test.js')
  })

  // TODO: (PPR) remove once PPR is stable
  // TODO(new-dev-overlay): remove once new dev overlay is stable
  const bundledReactVersionPattern =
    process.env.__NEXT_EXPERIMENTAL_PPR === 'true'
      ? '-experimental-'
      : '-canary-'

  it('should not use bundled react for pages with app', async () => {
    const ssrPaths = ['/pages-react', '/edge-pages-react']
    const promises = ssrPaths.map(async (pathname) => {
      const resPages$ = await next.render$(pathname)
      const ssrPagesReactVersions = [
        await resPages$('#react').text(),
        await resPages$('#react-dom').text(),
        await resPages$('#react-dom-server').text(),
      ]

      ssrPagesReactVersions.forEach((version) => {
        expect(version).not.toMatch(bundledReactVersionPattern)
      })
    })
    await Promise.all(promises)

    const resApp$ = await next.render$('/app-react')
    const ssrAppReactVersions = [
      await resApp$('#react').text(),
      await resApp$('#react-dom').text(),
    ]

    ssrAppReactVersions.forEach((version) =>
      expect(version).toMatch(bundledReactVersionPattern)
    )

    const browser = await next.browser('/pages-react')
    const browserPagesReactVersions = await browser.eval(`
      [
        document.querySelector('#react').innerText,
        document.querySelector('#react-dom').innerText,
        document.querySelector('#react-dom-server').innerText,
      ]
    `)

    await browser.loadPage(next.url + '/edge-pages-react')
    const browserEdgePagesReactVersions = await browser.eval(`
      [
        document.querySelector('#react').innerText,
        document.querySelector('#react-dom').innerText,
        document.querySelector('#react-dom-server').innerText,
      ]
    `)

    browserPagesReactVersions.forEach((version) => {
      expect(version).not.toMatch(bundledReactVersionPattern)
    })
    browserEdgePagesReactVersions.forEach((version) => {
      expect(version).not.toMatch(bundledReactVersionPattern)
    })
  })

  it('should use canary react for app', async () => {
    const resPages$ = await next.render$('/app-react')
    const [
      ssrReact,
      ssrReactDOM,
      ssrClientReact,
      ssrClientReactDOM,
      ssrClientReactDOMServer,
    ] = [
      resPages$('#react').text(),
      resPages$('#react-dom').text(),
      resPages$('#client-react').text(),
      resPages$('#client-react-dom').text(),
      resPages$('#client-react-dom-server').text(),
    ]
    expect({
      ssrReact,
      ssrReactDOM,
      ssrClientReact,
      ssrClientReactDOM,
      ssrClientReactDOMServer,
    }).toEqual({
      ssrReact: expect.stringMatching(bundledReactVersionPattern),
      ssrReactDOM: expect.stringMatching(bundledReactVersionPattern),
      ssrClientReact: expect.stringMatching(bundledReactVersionPattern),
      ssrClientReactDOM: expect.stringMatching(bundledReactVersionPattern),
      ssrClientReactDOMServer: expect.stringMatching(
        bundledReactVersionPattern
      ),
    })

    const browser = await next.browser('/app-react')
    const [
      browserReact,
      browserReactDOM,
      browserClientReact,
      browserClientReactDOM,
      browserClientReactDOMServer,
    ] = await browser.eval(`
      [
        document.querySelector('#react').innerText,
        document.querySelector('#react-dom').innerText,
        document.querySelector('#client-react').innerText,
        document.querySelector('#client-react-dom').innerText,
        document.querySelector('#client-react-dom-server').innerText,
      ]
    `)
    expect({
      browserReact,
      browserReactDOM,
      browserClientReact,
      browserClientReactDOM,
      browserClientReactDOMServer,
    }).toEqual({
      browserReact: expect.stringMatching(bundledReactVersionPattern),
      browserReactDOM: expect.stringMatching(bundledReactVersionPattern),
      browserClientReact: expect.stringMatching(bundledReactVersionPattern),
      browserClientReactDOM: expect.stringMatching(bundledReactVersionPattern),
      browserClientReactDOMServer: expect.stringMatching(
        bundledReactVersionPattern
      ),
    })
  })

  it('should be able to call legacy react-dom/server APIs in client components', async () => {
    const $ = await next.render$('/app-react')
    const content = $('#markup').text()
    expect(content).toBe(
      '<div class="react-static-markup">React Static Markup</div>'
    )

    if (isNextDev) {
      const filePath = 'app/app-react/client-react.js'
      const fileContent = await next.readFile(filePath)
      await next.patchFile(
        filePath,
        fileContent.replace(
          `import { renderToStaticMarkup } from 'react-dom/server'`,
          `import { renderToStaticMarkup } from 'react-dom/server.browser'`
        )
      )

      const browser = await next.browser('/app-react')
      const markupContentInBrowser = await browser
        .elementByCss('#markup')
        .text()
      expect(markupContentInBrowser).toBe(
        '<div class="react-static-markup">React Static Markup</div>'
      )

      await next.patchFile(filePath, fileContent)
    }
  })

  // disable this flaky test
  it.skip('should support partial hydration with inlined server data in browser', async () => {
    // Should end up with "next_streaming_data".
    const browser = await next.browser('/partial-hydration', {
      waitHydration: false,
    })
    const content = await browser.eval(`window.document.body.innerText`)
    expect(content).toContain('next_streaming_data')

    // Should support partial hydration: the boundary should still be pending
    // while another part is hydrated already.
    expect(await browser.eval(`window.partial_hydration_suspense_result`)).toBe(
      'next_streaming_fallback'
    )
    expect(await browser.eval(`window.partial_hydration_counter_result`)).toBe(
      'count: 1'
    )
  })

  if (isNextStart) {
    it('should generate edge SSR manifests for Node.js', async () => {
      const requiredServerFiles = JSON.parse(
        await next.readFile('.next/required-server-files.json')
      ).files

      const files = ['middleware-build-manifest.js', 'middleware-manifest.json']

      let promises = files.map(async (file) => {
        expect(await next.hasFile(path.join('.next/server', file))).toBe(true)
      })
      await Promise.all(promises)

      promises = requiredServerFiles.map(async (file) => {
        expect(await next.hasFile(file)).toBe(true)
      })
      await Promise.all(promises)
    })
  }

  describe('react@experimental', () => {
    it.each([{ flag: 'ppr' }, { flag: 'taint' }])(
      'should opt into the react@experimental when enabling $flag',
      async ({ flag }) => {
        await next.stop()
        await next.patchFile(
          'next.config.js',
          `
          module.exports = {
            experimental: {
              ${flag}: true
            }
          }
          `,
          async () => {
            await next.start()
            const resPages$ = await next.render$('/app-react')
            const [
              ssrReact,
              ssrReactDOM,
              ssrClientReact,
              ssrClientReactDOM,
              ssrClientReactDOMServer,
            ] = [
              resPages$('#react').text(),
              resPages$('#react-dom').text(),
              resPages$('#client-react').text(),
              resPages$('#client-react-dom').text(),
              resPages$('#client-react-dom-server').text(),
            ]
            expect({
              ssrReact,
              ssrReactDOM,
              ssrClientReact,
              ssrClientReactDOM,
              ssrClientReactDOMServer,
            }).toEqual({
              ssrReact: expect.stringMatching('-experimental-'),
              ssrReactDOM: expect.stringMatching('-experimental-'),
              ssrClientReact: expect.stringMatching('-experimental-'),
              ssrClientReactDOM: expect.stringMatching('-experimental-'),
              ssrClientReactDOMServer: expect.stringMatching('-experimental-'),
            })

            const browser = await next.browser('/app-react')
            const [
              browserReact,
              browserReactDOM,
              browserClientReact,
              browserClientReactDOM,
              browserClientReactDOMServer,
            ] = await browser.eval(`
              [
                document.querySelector('#react').innerText,
                document.querySelector('#react-dom').innerText,
                document.querySelector('#client-react').innerText,
                document.querySelector('#client-react-dom').innerText,
                document.querySelector('#client-react-dom-server').innerText,
              ]
            `)
            expect({
              browserReact,
              browserReactDOM,
              browserClientReact,
              browserClientReactDOM,
              browserClientReactDOMServer,
            }).toEqual({
              browserReact: expect.stringMatching('-experimental-'),
              browserReactDOM: expect.stringMatching('-experimental-'),
              browserClientReact: expect.stringMatching('-experimental-'),
              browserClientReactDOM: expect.stringMatching('-experimental-'),
              browserClientReactDOMServer:
                expect.stringMatching('-experimental-'),
            })
          }
        )
      }
    )
  })
})
