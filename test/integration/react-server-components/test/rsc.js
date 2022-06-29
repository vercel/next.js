/* eslint-env jest */
/* eslint-disable jest/no-commented-out-tests */
import webdriver from 'next-webdriver'
import { renderViaHTTP, fetchViaHTTP, check } from 'next-test-utils'
import { join } from 'path'
import fs from 'fs-extra'
import cheerio from 'cheerio'

function getNodeBySelector(html, selector) {
  const $ = cheerio.load(html)
  return $(selector)
}

async function resolveStreamResponse(response, onData) {
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

export default function (context, { runtime, env }) {
  const distDir = join(context.appDir, '.next')

  it('should support api routes', async () => {
    const res = await renderViaHTTP(context.appPort, '/api/ping')
    expect(res).toContain('pong')
  })

  // TODO: support RSC index route
  it.skip('should render server components correctly', async () => {
    const homeHTML = await renderViaHTTP(context.appPort, '/', null, {
      headers: {
        'x-next-test-client': 'test-util',
      },
    })

    const browser = await webdriver(context.appPort, '/')
    const scriptTagContent = await browser.elementById('client-script').text()
    // should have only 1 DOCTYPE
    expect(homeHTML).toMatch(/^<!DOCTYPE html><html/)
    expect(homeHTML).toMatch('<meta name="rsc-title" content="index"/>')
    expect(homeHTML).toContain('component:index.server')
    expect(homeHTML).toContain('env:env_var_test')
    expect(homeHTML).toContain('header:test-util')
    expect(homeHTML).toMatch(/<\/body><\/html>$/)

    expect(scriptTagContent).toBe(';')

    const inlineFlightContents = []
    const $ = cheerio.load(homeHTML)
    $('script').each((index, tag) => {
      const content = $(tag).text()
      if (content) inlineFlightContents.push(content)
    })

    const internalQueries = [
      '__nextFallback',
      '__nextLocale',
      '__nextDefaultLocale',
      '__nextIsNotFound',
      '__flight__',
      '__props__',
      '__flight_router_path__',
    ]

    const hasNextInternalQuery = inlineFlightContents.some((content) =>
      internalQueries.some((query) => content.includes(query))
    )
    expect(hasNextInternalQuery).toBe(false)
  })

  it('should reuse the inline flight response without sending extra requests', async () => {
    let hasFlightRequest = false
    let requestsCount = 0
    await webdriver(context.appPort, '/root', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          requestsCount++
          const url = request.url()
          if (/\?__flight__=1/.test(url)) {
            hasFlightRequest = true
          }
        })
      },
    })

    expect(requestsCount).toBeGreaterThan(0)
    expect(hasFlightRequest).toBe(false)
  })

  it('should support multi-level server component imports', async () => {
    const html = await renderViaHTTP(context.appPort, '/multi')
    expect(html).toContain('bar.server.js:')
    expect(html).toContain('foo.client')
  })

  it('should resolve different kinds of components correctly', async () => {
    const html = await renderViaHTTP(context.appPort, '/shared')
    const main = getNodeBySelector(html, '#main').html()

    // Should have 5 occurrences of "client_component".
    expect([...main.matchAll(/client_component/g)].length).toBe(5)

    // Should have 2 occurrences of "shared:server", and 2 occurrences of
    // "shared:client".
    const sharedServerModule = [...main.matchAll(/shared:server:(\d+)/g)]
    const sharedClientModule = [...main.matchAll(/shared:client:(\d+)/g)]
    expect(sharedServerModule.length).toBe(2)
    expect(sharedClientModule.length).toBe(2)

    // Should have 2 modules created for the shared component.
    expect(sharedServerModule[0][1]).toBe(sharedServerModule[1][1])
    expect(sharedClientModule[0][1]).toBe(sharedClientModule[1][1])
    expect(sharedServerModule[0][1]).not.toBe(sharedClientModule[0][1])

    // Note: This is currently unsupported because packages from another layer
    // will not be re-initialized by webpack.
    // Should import 2 module instances for node_modules too.
    // const modFromClient = main.match(
    //   /node_modules instance from \.client\.js:(\d+)/
    // )
    // const modFromServer = main.match(
    //   /node_modules instance from \.server\.js:(\d+)/
    // )
    // expect(modFromClient[1]).not.toBe(modFromServer[1])
  })

  // TODO: support dynamic routes for app dir
  it.skip('should render dynamic routes correctly', async () => {
    const dynamicRoute1HTML = await renderViaHTTP(
      context.appPort,
      '/routes/dynamic1'
    )
    const dynamicRoute2HTML = await renderViaHTTP(
      context.appPort,
      '/routes/dynamic2'
    )

    expect(dynamicRoute1HTML).toContain('query: dynamic1')
    expect(dynamicRoute1HTML).toContain('pathname: /routes/dynamic')
    expect(dynamicRoute2HTML).toContain('query: dynamic2')
    expect(dynamicRoute2HTML).toContain('pathname: /routes/dynamic')
    expect(dynamicRoute1HTML).toContain('router pathname: /routes/[dynamic]')
  })

  // FIXME: chunks missing in prod mode
  if (env === 'dev') {
    it('should be able to navigate between rsc pages', async () => {
      const browser = await webdriver(context.appPort, '/root')

      await browser.waitForElementByCss('#goto-next-link').click()
      await new Promise((res) => setTimeout(res, 1000))
      expect(await browser.url()).toBe(
        `http://localhost:${context.appPort}/next-api/link`
      )
      await browser.waitForElementByCss('#goto-home').click()
      await new Promise((res) => setTimeout(res, 1000))
      expect(await browser.url()).toBe(
        `http://localhost:${context.appPort}/root`
      )
      const content = await browser.elementByCss('body').text()
      expect(content).toContain('component:root.server')

      await browser.waitForElementByCss('#goto-streaming-rsc').click()

      // Wait for navigation and streaming to finish.
      await check(
        () => browser.elementByCss('#content').text(),
        'next_streaming_data'
      )
      expect(await browser.url()).toBe(
        `http://localhost:${context.appPort}/streaming-rsc`
      )
    })

    it('should handle streaming server components correctly', async () => {
      const browser = await webdriver(context.appPort, '/streaming-rsc')
      const content = await browser.eval(
        `document.querySelector('#content').innerText`
      )
      expect(content).toMatchInlineSnapshot('"next_streaming_data"')
    })

    it('should support next/link in server components', async () => {
      const linkHTML = await renderViaHTTP(context.appPort, '/next-api/link')
      const linkText = getNodeBySelector(
        linkHTML,
        'body > div > a[href="/root"]'
      ).text()

      expect(linkText).toContain('home')

      const browser = await webdriver(context.appPort, '/next-api/link')

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

      expect(await browser.eval('window.beforeNav')).toBe(1)
    })

    it('should refresh correctly with next/link', async () => {
      // Select the button which is not hidden but rendered
      const selector = '#goto-next-link'
      let hasFlightRequest = false
      const browser = await webdriver(context.appPort, '/root', {
        beforePageLoad(page) {
          page.on('request', (request) => {
            const url = request.url()
            if (/\?__flight__=1/.test(url)) {
              hasFlightRequest = true
            }
          })
        },
      })

      // wait for hydration
      await new Promise((res) => setTimeout(res, 1000))
      if (env === 'dev') {
        expect(hasFlightRequest).toBe(false)
      }
      await browser.elementByCss(selector).click()
      // wait for re-hydration
      await new Promise((res) => setTimeout(res, 1000))
      if (env === 'dev') {
        expect(hasFlightRequest).toBe(true)
      }
      const refreshText = await browser.elementByCss(selector).text()
      expect(refreshText).toBe('next link')
    })
  }

  it('should escape streaming data correctly', async () => {
    const browser = await webdriver(context.appPort, '/escaping-rsc')
    const manipulated = await browser.eval(`window.__manipulated_by_injection`)
    expect(manipulated).toBe(undefined)
  })

  // Disable next/image for nodejs runtime temporarily
  if (runtime === 'edge') {
    it('should suspense next/image in server components', async () => {
      const imageHTML = await renderViaHTTP(context.appPort, '/next-api/image')
      const imageTag = getNodeBySelector(imageHTML, 'body > span > span > img')

      expect(imageTag.attr('src')).toContain('data:image')
    })
  }

  // TODO: support esm import for RSC
  if (env === 'dev') {
    // For prod build, the directory contains the build ID so it's not deterministic.
    // Only enable it for dev for now.
    it.skip('should not bundle external imports into client builds for RSC', async () => {
      const html = await renderViaHTTP(context.appPort, '/external-imports')
      expect(html).toContain('date:')

      const distServerDir = join(distDir, 'static', 'chunks', 'pages')
      const bundle = fs
        .readFileSync(join(distServerDir, 'external-imports.js'))
        .toString()

      expect(bundle).not.toContain('non-isomorphic-text')
    })
  }

  // TODO: support esm import for RSC
  it.skip('should not pick browser field from package.json for external libraries', async () => {
    const html = await renderViaHTTP(context.appPort, '/external-imports')
    expect(html).toContain('isomorphic-export')
  })

  it('should handle various kinds of exports correctly', async () => {
    const html = await renderViaHTTP(context.appPort, '/various-exports')
    const content = getNodeBySelector(html, 'body').text()

    expect(content).toContain('abcde')
    expect(content).toContain('default-export-arrow.client')
    expect(content).toContain('named.client')

    const browser = await webdriver(context.appPort, '/various-exports')
    const hydratedContent = await browser.waitForElementByCss('body').text()

    expect(hydratedContent).toContain('abcde')
    expect(hydratedContent).toContain('default-export-arrow.client')
    expect(hydratedContent).toContain('named.client')
    expect(hydratedContent).toContain('cjs-shared')
    expect(hydratedContent).toContain('cjs-client')
    expect(hydratedContent).toContain('Export All: one, two, two')
  })

  it('should support native modules in server component', async () => {
    const html = await renderViaHTTP(context.appPort, '/native-module')
    const content = getNodeBySelector(html, 'body').text()

    expect(content).toContain('fs: function')
    expect(content).toContain('foo.client')
  })

  it('should support the re-export syntax in server component', async () => {
    const html = await renderViaHTTP(context.appPort, '/shared')
    const content = getNodeBySelector(html, '#bar').text()

    expect(content).toContain('bar.server.js:')
  })

  it('should SSR styled-jsx correctly', async () => {
    const html = await renderViaHTTP(context.appPort, '/styled-jsx')
    const styledJsxClass = getNodeBySelector(html, 'h1').attr('class')

    expect(html).toContain(`h1.${styledJsxClass}{color:red}`)
  })

  // TODO: support custom 404 for app dir
  it.skip('should handle 404 requests and missing routes correctly', async () => {
    const id = '#text'
    const content = 'custom-404-page'
    const page404HTML = await renderViaHTTP(context.appPort, '/404')
    const pageUnknownHTML = await renderViaHTTP(context.appPort, '/no.where')
    let browser = await webdriver(context.appPort, '/404')
    const hydrated404Content = await browser.waitForElementByCss(id).text()
    browser = await webdriver(context.appPort, '/no.where')
    const hydratedUnknownContent = await browser.waitForElementByCss(id).text()

    expect(hydrated404Content).toBe(content)
    expect(hydratedUnknownContent).toBe(content)

    expect(getNodeBySelector(page404HTML, id).text()).toBe(content)
    expect(getNodeBySelector(pageUnknownHTML, id).text()).toBe(content)
  })

  it.skip('should support streaming for flight response', async () => {
    await fetchViaHTTP(context.appPort, '/?__flight__=1').then(
      async (response) => {
        const result = await resolveStreamResponse(response)
        expect(result).toContain('component:index.server')
      }
    )
  })

  it('should support partial hydration with inlined server data', async () => {
    await fetchViaHTTP(context.appPort, '/partial-hydration', null, {}).then(
      async (response) => {
        let gotFallback = false
        let gotData = false
        let gotInlinedData = false

        await resolveStreamResponse(response, (_, result) => {
          gotInlinedData = result.includes('self.__next_s=')
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

    // Should end up with "next_streaming_data".
    const browser = await webdriver(context.appPort, '/partial-hydration')
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

  // TODO: _app + next/head
  it.skip('should support next/head inside _app with RSC', async () => {
    const browser = await webdriver(context.appPort, '/multi')
    const title = await browser.eval(`document.title`)
    expect(title).toBe('hi')
  })
}

/*
TODO: re-enable css suite once css is supported in app-dir

it.skip('should include global styles with `serverComponents: true`', async () => {
  const browser = await webdriver(context.appPort, '/global-styles-rsc')
  const currentColor = await browser.eval(
    `window.getComputedStyle(document.querySelector('#red')).color`
  )
  expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
})

it.skip('should include css modules with `serverComponents: true`', async () => {
  const browser = await webdriver(context.appPort, '/css-modules')
  const currentColor = await browser.eval(
    `window.getComputedStyle(document.querySelector('h1')).color`
  )
  expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
})

export default function (context) {
  it.skip("should include global styles under `runtime: 'edge'`", async () => {
    const browser = await webdriver(context.appPort, '/global-styles')
    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  })
}
*/
