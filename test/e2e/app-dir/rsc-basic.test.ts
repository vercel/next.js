import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { renderViaHTTP, fetchViaHTTP, check } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import cheerio from 'cheerio'

function getNodeBySelector(html, selector) {
  const $ = cheerio.load(html)
  return $(selector)
}

async function resolveStreamResponse(response: any, onData?: any) {
  let result = ''
  onData = onData || (() => {})
  await new Promise((resolve) => {
    response.body.on('data', (chunk) => {
      result += chunk.toString()
      onData(chunk.toString(), result)
    })

    response.body.on('end', resolve)
  })
  return result
}

describe('app dir - rsc basics', () => {
  let next: NextInstance
  let distDir: string

  if ((global as any).isNextDeploy) {
    it('should skip for deploy mode for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './rsc-basic')),
      dependencies: {
        'styled-components': '6.0.0-beta.2',
        react: 'latest',
        'react-dom': 'latest',
      },
      packageJson: {
        scripts: {
          build: 'next build',
          dev: 'next dev',
          start: 'next start',
        },
      },
      installCommand: 'yarn',
      startCommand: (global as any).isNextDev ? 'yarn dev' : 'yarn start',
      buildCommand: 'yarn build',
    })
    distDir = path.join(next.testDir, '.next')
  })
  afterAll(() => next.destroy())

  const { isNextDeploy, isNextDev } = global as any
  const isReact17 = process.env.NEXT_TEST_REACT_VERSION === '^17'
  if (isNextDeploy || isReact17) {
    it('should skip tests for next-deploy and react 17', () => {})
    return
  }

  it('should render server components correctly', async () => {
    const homeHTML = await renderViaHTTP(next.url, '/', null, {
      headers: {
        'x-next-test-client': 'test-util',
      },
    })

    // should have only 1 DOCTYPE
    expect(homeHTML).toMatch(/^<!DOCTYPE html><html/)
    expect(homeHTML).toContain('component:index.server')
    expect(homeHTML).toContain('header:test-util')

    const inlineFlightContents = []
    const $ = cheerio.load(homeHTML)
    $('script').each((_index, tag) => {
      const content = $(tag).text()
      if (content) inlineFlightContents.push(content)
    })

    const internalQueries = [
      '__nextFallback',
      '__nextLocale',
      '__nextDefaultLocale',
      '__nextIsNotFound',
      '__rsc__',
      '__next_router_state_tree__',
      '__next_router_prefetch__',
    ]

    const hasNextInternalQuery = inlineFlightContents.some((content) =>
      internalQueries.some((query) => content.includes(query))
    )
    expect(hasNextInternalQuery).toBe(false)
  })

  it('should reuse the inline flight response without sending extra requests', async () => {
    let hasFlightRequest = false
    let requestsCount = 0
    await webdriver(next.url, '/root', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          requestsCount++
          return request.allHeaders().then((headers) => {
            if (
              headers.__rsc__ === '1' &&
              // Prefetches also include `__rsc__`
              headers.__next_router_prefetch__ !== '1'
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
    const html = await renderViaHTTP(next.url, '/multi')
    expect(html).toContain('bar.server.js:')
    expect(html).toContain('foo.client')
  })

  it('should be able to navigate between rsc routes', async () => {
    const browser = await webdriver(next.url, '/root')

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
    const browser = await webdriver(next.url, '/streaming-rsc')
    const content = await browser.eval(
      `document.querySelector('#content').innerText`
    )
    expect(content).toMatchInlineSnapshot('"next_streaming_data"')
  })

  it('should support next/link in server components', async () => {
    const linkHTML = await renderViaHTTP(next.url, '/next-api/link')
    const linkText = getNodeBySelector(linkHTML, 'body a[href="/root"]').text()

    expect(linkText).toContain('home')

    const browser = await webdriver(next.url, '/next-api/link')

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

  it('should refresh correctly with next/link', async () => {
    // Select the button which is not hidden but rendered
    const selector = '#goto-next-link'
    let hasFlightRequest = false
    const browser = await webdriver(next.url, '/root', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          return request.allHeaders().then((headers) => {
            if (
              headers.__rsc__ === '1' &&
              headers.__next_router_prefetch__ !== '1'
            ) {
              hasFlightRequest = true
            }
          })
        })
      },
    })

    // wait for hydration
    await new Promise((res) => setTimeout(res, 1000))
    if (isNextDev) {
      expect(hasFlightRequest).toBe(false)
    }
    await browser.elementByCss(selector).click()

    // wait for re-hydration
    if (isNextDev) {
      await check(
        () => (hasFlightRequest ? 'success' : hasFlightRequest),
        'success'
      )
    }
    const refreshText = await browser.elementByCss(selector).text()
    expect(refreshText).toBe('next link')
  })

  it('should escape streaming data correctly', async () => {
    const browser = await webdriver(next.url, '/escaping-rsc')
    const manipulated = await browser.eval(`window.__manipulated_by_injection`)
    expect(manipulated).toBe(undefined)
  })

  it('should render built-in 404 page for missing route if pagesDir is not presented', async () => {
    const res = await fetchViaHTTP(next.url, '/does-not-exist')

    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html).toContain('This page could not be found')
  })

  it('should suspense next/legacy/image in server components', async () => {
    const imageHTML = await renderViaHTTP(next.url, '/next-api/image-legacy')
    const imageTag = getNodeBySelector(imageHTML, '#myimg')

    expect(imageTag.attr('src')).toContain('data:image')
  })

  it('should suspense next/image in server components', async () => {
    const imageHTML = await renderViaHTTP(next.url, '/next-api/image-new')
    const imageTag = getNodeBySelector(imageHTML, '#myimg')

    expect(imageTag.attr('src')).toMatch(/test.+jpg/)
  })

  it('should handle various kinds of exports correctly', async () => {
    const html = await renderViaHTTP(next.url, '/various-exports')
    const content = getNodeBySelector(html, 'body').text()

    expect(content).toContain('abcde')
    expect(content).toContain('default-export-arrow.client')
    expect(content).toContain('named.client')

    const browser = await webdriver(next.url, '/various-exports')
    const hydratedContent = await browser.waitForElementByCss('body').text()

    expect(hydratedContent).toContain('abcde')
    expect(hydratedContent).toContain('default-export-arrow.client')
    expect(hydratedContent).toContain('named.client')
    expect(hydratedContent).toContain('cjs-shared')
    expect(hydratedContent).toContain('cjs-client')
    expect(hydratedContent).toContain('Export All: one, two, two')
  })

  it('should support native modules in server component', async () => {
    const html = await renderViaHTTP(next.url, '/native-module')
    const content = getNodeBySelector(html, 'body').text()

    expect(content).toContain('fs: function')
    expect(content).toContain('foo.client')
  })

  it('should resolve different kinds of components correctly', async () => {
    const html = await renderViaHTTP(next.url, '/shared')
    const main = getNodeBySelector(html, '#main').html()
    const content = getNodeBySelector(html, '#bar').text()

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

  it('should render initial styles of css-in-js in SSR correctly', async () => {
    const html = await renderViaHTTP(next.url, '/css-in-js')
    const head = getNodeBySelector(html, 'head').html()

    // from styled-jsx
    expect(head).toMatch(/{color:(\s*)purple;?}/) // styled-jsx/style
    expect(head).toMatch(/{color:(\s*)hotpink;?}/) // styled-jsx/css

    // from styled-components
    expect(head).toMatch(/{color:(\s*)blue;?}/)

    // css-in-js like styled-jsx in server components won't be transformed
    expect(html).toMatch(
      /<style>\s*\.this-wont-be-transformed\s*\{\s*color:\s*purple;\s*\}\s*<\/style>/
    )
  })

  it('should stick to the url without trailing /page suffix', async () => {
    const browser = await webdriver(next.url, '/edge/dynamic')
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
    await fetchViaHTTP(
      next.url,
      '/',
      {},
      {
        headers: {
          __rsc__: '1',
        },
      }
    ).then(async (response) => {
      const result = await resolveStreamResponse(response)
      expect(result).toContain('component:index.server')
    })
  })

  it('should support partial hydration with inlined server data', async () => {
    await fetchViaHTTP(next.url, '/partial-hydration', null, {}).then(
      async (response) => {
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
              expect(gotInlinedData).toBe(false)
            }
          }
        })

        expect(gotFallback).toBe(true)
        expect(gotData).toBe(true)
        expect(gotInlinedData).toBe(true)
      }
    )
  })

  // disable this flaky test
  it.skip('should support partial hydration with inlined server data in browser', async () => {
    // Should end up with "next_streaming_data".
    const browser = await webdriver(next.url, '/partial-hydration', {
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

  if (!isNextDev) {
    it('should generate edge SSR manifests for Node.js', async () => {
      const distServerDir = path.join(distDir, 'server')

      const requiredServerFiles = (
        await fs.readJSON(path.join(distDir, 'required-server-files.json'))
      ).files

      const files = [
        'middleware-build-manifest.js',
        'middleware-manifest.json',
        'flight-manifest.json',
      ]

      files.forEach((file) => {
        const filepath = path.join(distServerDir, file)
        expect(fs.existsSync(filepath)).toBe(true)
      })

      requiredServerFiles.forEach((file) => {
        const requiredFilePath = path.join(next.testDir, file)
        expect(fs.existsSync(requiredFilePath)).toBe(true)
      })
    })
  }
})
