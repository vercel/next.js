/* eslint-env jest */
import webdriver from 'next-webdriver'
import { renderViaHTTP, check } from 'next-test-utils'
import { join } from 'path'
import fs from 'fs-extra'
import { getNodeBySelector } from './utils'

export default function (context, { runtime, env }) {
  const distDir = join(context.appDir, '.next')

  it('should support api routes', async () => {
    const res = await renderViaHTTP(context.appPort, '/api/ping')
    expect(res).toContain('pong')
  })

  it('should render server components correctly', async () => {
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
  })

  it('should reuse the inline flight response without sending extra requests', async () => {
    let hasFlightRequest = false
    let requestsCount = 0
    await webdriver(context.appPort, '/', {
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

    // Should import 2 module instances for node_modules too.
    const modFromClient = main.match(
      /node_modules instance from \.client\.js:(\d+)/
    )
    const modFromServer = main.match(
      /node_modules instance from \.server\.js:(\d+)/
    )
    expect(modFromClient[1]).not.toBe(modFromServer[1])
  })

  it('should support next/link in server components', async () => {
    const linkHTML = await renderViaHTTP(context.appPort, '/next-api/link')
    const linkText = getNodeBySelector(
      linkHTML,
      '#__next > div > a[href="/"]'
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

  it('should render dynamic routes correctly', async () => {
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
  })

  it('should be able to navigate between rsc pages', async () => {
    let content
    const browser = await webdriver(context.appPort, '/')

    await browser.waitForElementByCss('#goto-next-link').click()
    await new Promise((res) => setTimeout(res, 1000))
    expect(await browser.url()).toBe(
      `http://localhost:${context.appPort}/next-api/link`
    )
    await browser.waitForElementByCss('#goto-home').click()
    await new Promise((res) => setTimeout(res, 1000))
    expect(await browser.url()).toBe(`http://localhost:${context.appPort}/`)
    content = await browser.elementByCss('#__next').text()
    expect(content).toContain('component:index.server')

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

  // Disable next/image for nodejs runtime temporarily
  if (runtime === 'edge') {
    it('should suspense next/image in server components', async () => {
      const imageHTML = await renderViaHTTP(context.appPort, '/next-api/image')
      const imageTag = getNodeBySelector(
        imageHTML,
        '#__next > span > span > img'
      )

      expect(imageTag.attr('src')).toContain('data:image')
    })
  }

  it('should refresh correctly with next/link', async () => {
    // Select the button which is not hidden but rendered
    const selector = '#__next #goto-next-link'
    let hasFlightRequest = false
    const browser = await webdriver(context.appPort, '/', {
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

  if (env === 'dev') {
    // For prod build, the directory contains the build ID so it's not deterministic.
    // Only enable it for dev for now.
    it('should not bundle external imports into client builds for RSC', async () => {
      const html = await renderViaHTTP(context.appPort, '/external-imports')
      expect(html).toContain('date:')

      const distServerDir = join(distDir, 'static', 'chunks', 'pages')
      const bundle = fs
        .readFileSync(join(distServerDir, 'external-imports.js'))
        .toString()

      expect(bundle).not.toContain('non-isomorphic-text')
    })
  }

  it('should not pick browser field from package.json for external libraries', async () => {
    const html = await renderViaHTTP(context.appPort, '/external-imports')
    expect(html).toContain('isomorphic-export')
  })

  it('should handle various kinds of exports correctly', async () => {
    const html = await renderViaHTTP(context.appPort, '/various-exports')
    const content = getNodeBySelector(html, '#__next').text()

    expect(content).toContain('abcde')
    expect(content).toContain('default-export-arrow.client')
    expect(content).toContain('named.client')

    const browser = await webdriver(context.appPort, '/various-exports')
    const hydratedContent = await browser.waitForElementByCss('#__next').text()

    expect(hydratedContent).toContain('abcde')
    expect(hydratedContent).toContain('default-export-arrow.client')
    expect(hydratedContent).toContain('named.client')
    expect(hydratedContent).toContain('cjs-shared')
    expect(hydratedContent).toContain('cjs-client')
    expect(hydratedContent).toContain('Export All: one, two, two')
  })

  it('should support native modules in server component', async () => {
    const html = await renderViaHTTP(context.appPort, '/native-module')
    const content = getNodeBySelector(html, '#__next').text()

    expect(content).toContain('fs: function')
    expect(content).toContain('foo.client')
  })

  it('should support the re-export syntax in server component', async () => {
    const html = await renderViaHTTP(context.appPort, '/re-export')
    const content = getNodeBySelector(html, '#__next').text()

    expect(content).toContain('This should be in red')
  })

  it('should handle 404 requests and missing routes correctly', async () => {
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
}
