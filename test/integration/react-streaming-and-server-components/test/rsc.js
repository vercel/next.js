/* eslint-env jest */
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { renderViaHTTP, check } from 'next-test-utils'
import { join } from 'path'
import fs from 'fs-extra'

import { distDir } from './utils'

function getNodeBySelector(html, selector) {
  const $ = cheerio.load(html)
  return $(selector)
}

export default function (context, { runtime, env }) {
  it('should render server components correctly', async () => {
    const homeHTML = await renderViaHTTP(context.appPort, '/', null, {
      headers: {
        'x-next-test-client': 'test-util',
      },
    })

    // should have only 1 DOCTYPE
    expect(homeHTML).toMatch(/^<!DOCTYPE html><html/)

    expect(homeHTML).toContain('component:index.server')
    expect(homeHTML).toContain('env:env_var_test')
    expect(homeHTML).toContain('header:test-util')
    expect(homeHTML).toContain('path:/')
    expect(homeHTML).toContain('foo.client')
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

  it('should support next/link in server components', async () => {
    const linkHTML = await renderViaHTTP(context.appPort, '/next-api/link')
    const linkText = getNodeBySelector(
      linkHTML,
      'div[hidden] > a[href="/"]'
    ).text()

    expect(linkText).toContain('go home')

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

  // Disable next/image for nodejs runtime temporarily
  if (runtime === 'edge') {
    it('should suspense next/image in server components', async () => {
      const imageHTML = await renderViaHTTP(context.appPort, '/next-api/image')
      const imageTag = getNodeBySelector(
        imageHTML,
        'div[hidden] > span > span > img'
      )

      expect(imageTag.attr('src')).toContain('data:image')
    })
  }

  it('should refresh correctly with next/link', async () => {
    // Select the button which is not hidden but rendered
    const selector = '#__next #refresh'
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
    expect(refreshText)
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

      expect(bundle).not.toContain('moment')
    })
  }

  it('should handle multiple named exports correctly', async () => {
    const clientExportsHTML = await renderViaHTTP(
      context.appPort,
      '/client-exports'
    )

    expect(
      getNodeBySelector(
        clientExportsHTML,
        'div[hidden] > div > #named-exports'
      ).text()
    ).toBe('abcde')
    expect(
      getNodeBySelector(
        clientExportsHTML,
        'div[hidden] > div > #default-exports-arrow'
      ).text()
    ).toBe('client-default-export-arrow')

    const browser = await webdriver(context.appPort, '/client-exports')
    const textNamedExports = await browser
      .waitForElementByCss('#named-exports')
      .text()
    const textDefaultExportsArrow = await browser
      .waitForElementByCss('#default-exports-arrow')
      .text()
    expect(textNamedExports).toBe('abcde')
    expect(textDefaultExportsArrow).toBe('client-default-export-arrow')
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
