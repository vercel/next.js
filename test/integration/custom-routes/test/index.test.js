/* eslint-env jest */

import http from 'http'
import url from 'url'
import stripAnsi from 'strip-ansi'
import fs from 'fs-extra'
import { join } from 'path'
import WebSocket from 'ws'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import escapeRegex from 'escape-string-regexp'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  fetchViaHTTP,
  renderViaHTTP,
  getBrowserBodyText,
  waitFor,
  normalizeRegEx,
  nextExport,
  hasRedbox,
  check,
} from 'next-test-utils'

let appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')
let externalServerHits = new Set()
let nextConfigRestoreContent
let nextConfigContent
let externalServerPort
let externalServer
let stdout = ''
let stderr = ''
let buildId
let appPort
let app

const runTests = (isDev = false, isTurbo = false) => {
  it.each([
    {
      path: '/to-ANOTHER',
      content: /could not be found/,
      status: 404,
    },
    {
      path: '/HELLO-world',
      content: /could not be found/,
      status: 404,
    },
    {
      path: '/docs/GITHUB',
      content: /could not be found/,
      status: 404,
    },
    {
      path: '/add-HEADER',
      content: /could not be found/,
      status: 404,
    },
  ])(
    'should honor caseSensitiveRoutes config for $path',
    async ({ path, status, content }) => {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })

      if (status) {
        expect(res.status).toBe(status)
      }

      if (content) {
        expect(await res.text()).toMatch(content)
      }
    }
  )

  it('should successfully rewrite a WebSocket request', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const messages = []
    const ws = await new Promise((resolve, reject) => {
      let socket = new WebSocket(`ws://localhost:${appPort}/to-websocket`)
      socket.on('message', (data) => {
        messages.push(data.toString())
      })
      socket.on('open', () => resolve(socket))
      socket.on('error', (err) => {
        console.error(err)
        socket.close()
        reject()
      })
    })

    await check(
      () => (messages.length > 0 ? 'success' : JSON.stringify(messages)),
      'success'
    )
    ws.close()
    expect([...externalServerHits]).toEqual(['/_next/webpack-hmr?page=/about'])
  })

  it('should successfully rewrite a WebSocket request to a page', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const messages = []
    try {
      const ws = await new Promise((resolve, reject) => {
        let socket = new WebSocket(
          `ws://localhost:${appPort}/websocket-to-page`
        )
        socket.on('message', (data) => {
          messages.push(data.toString())
        })
        socket.on('open', () => resolve(socket))
        socket.on('error', (err) => {
          console.error(err)
          socket.close()
          reject()
        })
      })
      ws.close()
    } catch (err) {
      messages.push(err)
    }
    expect(stderr).not.toContain('unhandledRejection')
  })

  it('should not rewrite for _next/data route when a match is found', async () => {
    const initial = await fetchViaHTTP(appPort, '/overridden/first')
    expect(initial.status).toBe(200)
    expect(await initial.text()).toContain('this page is overridden')

    const nextData = await fetchViaHTTP(
      appPort,
      `/_next/data/${buildId}/overridden/first.json`
    )
    expect(nextData.status).toBe(200)
    expect(await nextData.json()).toEqual({
      pageProps: { params: { slug: 'first' } },
      __N_SSG: true,
    })
  })

  it('should handle has query encoding correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    for (const expected of [
      {
        post: 'first',
        slug: ['first'],
      },
      {
        post: 'hello%20world',
        slug: ['hello world'],
      },
      {
        post: 'hello/world',
        slug: ['hello', 'world'],
      },
      {
        post: 'hello%2fworld',
        slug: ['hello', 'world'],
      },
    ]) {
      const { status = 200, post } = expected
      const res = await fetchViaHTTP(
        appPort,
        '/has-rewrite-8',
        `?post=${post}`,
        {
          redirect: 'manual',
        }
      )

      expect(res.status).toBe(status)

      if (status === 200) {
        const $ = cheerio.load(await res.text())
        expect(JSON.parse($('#props').text())).toEqual({
          params: {
            slug: expected.slug,
          },
        })
      }
    }
  })

  it('should handle external beforeFiles rewrite correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/overridden')
    const html = await res.text()

    if (res.status !== 200) {
      console.error('Invalid response', html)
    }
    expect(res.status).toBe(200)
    expect(html).toContain('Example Domain')

    const browser = await webdriver(appPort, '/nav')
    await browser.elementByCss('#to-before-files-overridden').click()
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /Example Domain/
    )
  })

  it('should handle beforeFiles rewrite to dynamic route correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/nfl')
    const html = await res.text()

    if (res.status !== 200) {
      console.error('Invalid response', html)
    }
    expect(res.status).toBe(200)
    expect(html).toContain('/_sport/[slug]')

    const browser = await webdriver(appPort, '/nav')
    await browser.eval('window.beforeNav = 1')
    await browser.elementByCss('#to-before-files-dynamic').click()
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /_sport\/\[slug\]/
    )
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      slug: 'nfl',
    })
    expect(await browser.elementByCss('#pathname').text()).toBe(
      '/_sport/[slug]'
    )
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should handle beforeFiles rewrite to partly dynamic route correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/nfl')
    const html = await res.text()

    if (res.status !== 200) {
      console.error('Invalid response', html)
    }
    expect(res.status).toBe(200)
    expect(html).toContain('/_sport/[slug]')

    const browser = await webdriver(appPort, '/nav')
    await browser.eval('window.beforeNav = 1')
    await browser.elementByCss('#to-before-files-dynamic-again').click()
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /_sport\/\[slug\]\/test/
    )
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      slug: 'nfl',
    })
    expect(await browser.elementByCss('#pathname').text()).toBe(
      '/_sport/[slug]/test'
    )
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should support long URLs for rewrites', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/catchall-rewrite/a9btBxtHQALZ6cxfuj18X6OLGNSkJVzrOXz41HG4QwciZfn7ggRZzPx21dWqGiTBAqFRiWvVNm5ko2lpyso5jtVaXg88dC1jKfqI2qmIcdeyJat8xamrIh2LWnrYRrsBcoKfQU65KHod8DPANuzPS3fkVYWlmov05GQbc82HwR1exOvPVKUKb5gBRWiN0WOh7hN4QyezIuq3dJINAptFQ6m2bNGjYACBRk4MOSHdcQG58oq5Ch7luuqrl9EcbWSa'
    )

    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('/with-params')
  })

  it('should resolveHref correctly navigating through history', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const browser = await webdriver(appPort, '/')
    await browser.eval('window.beforeNav = 1')

    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      'multi-rewrites'
    )

    await browser.eval('next.router.push("/rewriting-to-auto-export")')
    await browser.waitForElementByCss('#auto-export')

    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      slug: 'hello',
      rewrite: '1',
    })
    expect(await browser.eval('window.beforeNav')).toBe(1)

    await browser.eval('next.router.push("/nav")')
    await browser.waitForElementByCss('#nav')

    expect(await browser.elementByCss('#nav').text()).toBe('Nav')

    await browser.back()
    await browser.waitForElementByCss('#auto-export')

    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      slug: 'hello',
      rewrite: '1',
    })
    expect(await browser.eval('window.beforeNav')).toBe(1)

    if (isDev) {
      expect(await hasRedbox(browser, false)).toBe(false)
    }
  })

  it('should continue in beforeFiles rewrites', async () => {
    const res = await fetchViaHTTP(appPort, '/old-blog/about')
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#hello').text()).toContain('Hello')

    const browser = await webdriver(appPort, '/nav')

    await browser.eval('window.beforeNav = 1')
    await browser
      .elementByCss('#to-old-blog')
      .click()
      .waitForElementByCss('#hello')
    expect(await browser.elementByCss('#hello').text()).toContain('Hello')
  })

  it('should not hang when proxy rewrite fails', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/to-nowhere', undefined, {
      timeout: 5000,
    })

    expect(res.status).toBe(500)
  })

  it('should parse params correctly for rewrite to auto-export dynamic page', async () => {
    const browser = await webdriver(appPort, '/rewriting-to-auto-export')
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /auto-export.*?hello/
    )
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      rewrite: '1',
      slug: 'hello',
    })
  })

  it('should provide params correctly for rewrite to auto-export non-dynamic page', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const browser = await webdriver(
      appPort,
      '/rewriting-to-another-auto-export/first'
    )

    expect(await browser.elementByCss('#auto-export-another').text()).toBe(
      'auto-export another'
    )
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      rewrite: '1',
      path: ['first'],
    })
  })

  it('should handle one-to-one rewrite successfully', async () => {
    const html = await renderViaHTTP(appPort, '/first')
    expect(html).toMatch(/hello/)
  })

  it('should handle chained rewrites successfully', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/multi-rewrites/)
  })

  it('should handle param like headers properly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/my-other-header/my-path')
    expect(res.headers.get('x-path')).toBe('my-path')
    expect(res.headers.get('somemy-path')).toBe('hi')
    expect(res.headers.get('x-test')).toBe('some:value*')
    expect(res.headers.get('x-test-2')).toBe('value*')
    expect(res.headers.get('x-test-3')).toBe(':value?')
    expect(res.headers.get('x-test-4')).toBe(':value+')
    expect(res.headers.get('x-test-5')).toBe('something https:')
    expect(res.headers.get('x-test-6')).toBe(':hello(world)')
    expect(res.headers.get('x-test-7')).toBe('hello(world)')
    expect(res.headers.get('x-test-8')).toBe('hello{1,}')
    expect(res.headers.get('x-test-9')).toBe(':hello{1,2}')
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'self'; img-src *; media-src media1.com media2.com; script-src userscripts.example.com/my-path"
    )
  })

  it('should not match dynamic route immediately after applying header', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/blog/post-321')
    expect(res.headers.get('x-something')).toBe('applied-everywhere')

    const $ = cheerio.load(await res.text())
    expect(JSON.parse($('p').text()).path).toBe('blog')
  })

  it('should handle chained redirects successfully', async () => {
    const res1 = await fetchViaHTTP(appPort, '/redir-chain1', undefined, {
      redirect: 'manual',
    })
    const res1location = url.parse(res1.headers.get('location')).pathname
    expect(res1.status).toBe(301)
    expect(res1location).toBe('/redir-chain2')

    const res2 = await fetchViaHTTP(appPort, res1location, undefined, {
      redirect: 'manual',
    })
    const res2location = url.parse(res2.headers.get('location')).pathname
    expect(res2.status).toBe(302)
    expect(res2location).toBe('/redir-chain3')

    const res3 = await fetchViaHTTP(appPort, res2location, undefined, {
      redirect: 'manual',
    })
    const res3location = url.parse(res3.headers.get('location')).pathname
    expect(res3.status).toBe(303)
    expect(res3location).toBe('/')
  })

  it('should not match redirect for /_next', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/_next/has-redirect-5',
      undefined,
      {
        headers: {
          'x-test-next': 'true',
        },
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(
      appPort,
      '/another/has-redirect-5',
      undefined,
      {
        headers: {
          'x-test-next': 'true',
        },
        redirect: 'manual',
      }
    )
    expect(res2.status).toBe(307)
  })

  it('should redirect successfully with permanent: false', async () => {
    const res = await fetchViaHTTP(appPort, '/redirect1', undefined, {
      redirect: 'manual',
    })
    const { pathname } = url.parse(res.headers.get('location'))
    expect(res.status).toBe(307)
    expect(pathname).toBe('/')
  })

  it('should redirect with params successfully', async () => {
    const res = await fetchViaHTTP(appPort, '/hello/123/another', undefined, {
      redirect: 'manual',
    })
    const { pathname } = url.parse(res.headers.get('location'))
    expect(res.status).toBe(307)
    expect(pathname).toBe('/blog/123')
  })

  it('should redirect with hash successfully', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/docs/router-status/500',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname, hash, query } = url.parse(
      res.headers.get('location'),
      true
    )
    expect(res.status).toBe(301)
    expect(pathname).toBe('/docs/v2/network/status-codes')
    expect(hash).toBe('#500')
    expect(query).toEqual({})
  })

  it('should redirect successfully with provided statusCode', async () => {
    const res = await fetchViaHTTP(appPort, '/redirect2', undefined, {
      redirect: 'manual',
    })
    const { pathname, query } = url.parse(res.headers.get('location'), true)
    expect(res.status).toBe(301)
    expect(pathname).toBe('/')
    expect(query).toEqual({})
  })

  it('should redirect successfully with catchall', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/catchall-redirect/hello/world',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname, query } = url.parse(res.headers.get('location'), true)
    expect(res.status).toBe(307)
    expect(pathname).toBe('/somewhere')
    expect(query).toEqual({})
  })

  it('should server static files through a rewrite', async () => {
    const text = await renderViaHTTP(appPort, '/hello-world')
    expect(text).toBe('hello world!')
  })

  it('should rewrite with params successfully', async () => {
    const html = await renderViaHTTP(appPort, '/test/hello')
    expect(html).toMatch(/Hello/)
  })

  it('should not append params when one is used in destination path', async () => {
    const html = await renderViaHTTP(appPort, '/test/with-params?a=b')
    const $ = cheerio.load(html)
    expect(JSON.parse($('p').text())).toEqual({ a: 'b' })
  })

  it('should double redirect successfully', async () => {
    const html = await renderViaHTTP(appPort, '/docs/github')
    expect(html).toMatch(/hi there/)
  })

  it('should allow params in query for rewrite', async () => {
    const html = await renderViaHTTP(appPort, '/query-rewrite/hello/world?a=b')
    const $ = cheerio.load(html)
    expect(JSON.parse($('#__NEXT_DATA__').html()).query).toEqual({
      first: 'hello',
      second: 'world',
      a: 'b',
      section: 'hello',
      name: 'world',
    })
  })

  it('should have correct params for catchall rewrite', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/catchall-rewrite/hello/world?a=b'
    )
    const $ = cheerio.load(html)
    expect(JSON.parse($('#__NEXT_DATA__').html()).query).toEqual({
      a: 'b',
      path: ['hello', 'world'],
    })
  })

  it('should have correct encoding for params with catchall rewrite', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const html = await renderViaHTTP(
      appPort,
      '/catchall-rewrite/hello%20world%3Fw%3D24%26focalpoint%3Dcenter?a=b'
    )
    const $ = cheerio.load(html)
    expect(JSON.parse($('#__NEXT_DATA__').html()).query).toEqual({
      a: 'b',
      path: ['hello%20world%3Fw%3D24%26focalpoint%3Dcenter'],
    })
  })

  it('should have correct query for catchall rewrite', async () => {
    const html = await renderViaHTTP(appPort, '/catchall-query/hello/world?a=b')
    const $ = cheerio.load(html)
    expect(JSON.parse($('#__NEXT_DATA__').html()).query).toEqual({
      a: 'b',
      another: 'hello/world',
      path: ['hello', 'world'],
    })
  })

  it('should have correct header for catchall rewrite', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/catchall-header/hello/world?a=b')
    const headerValue = res.headers.get('x-value')
    expect(headerValue).toBe('hello/world')
  })

  it('should allow params in query for redirect', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/query-redirect/hello/world?a=b',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname, query } = url.parse(res.headers.get('location'), true)
    expect(res.status).toBe(307)
    expect(pathname).toBe('/with-params')
    expect(query).toEqual({
      first: 'hello',
      second: 'world',
      a: 'b',
    })
  })

  it('should have correctly encoded params in query for redirect', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(
      appPort,
      '/query-redirect/hello%20world%3Fw%3D24%26focalpoint%3Dcenter/world?a=b',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname, query } = url.parse(res.headers.get('location'), true)
    expect(res.status).toBe(307)
    expect(pathname).toBe('/with-params')
    expect(query).toEqual({
      // this should be decoded since url.parse decodes query values
      first: 'hello world?w=24&focalpoint=center',
      second: 'world',
      a: 'b',
    })
  })

  it('should overwrite param values correctly', async () => {
    const html = await renderViaHTTP(appPort, '/test-overwrite/first/second')
    expect(html).toMatch(/this-should-be-the-value/)
    expect(html).not.toMatch(/first/)
    expect(html).toMatch(/second/)
  })

  it('should handle query for rewrite correctly', async () => {
    // query merge order lowest priority to highest
    // 1. initial URL query values
    // 2. path segment values
    // 3. destination specified query values

    const html = await renderViaHTTP(
      appPort,
      '/query-rewrite/first/second?section=overridden&name=overridden&first=overridden&second=overridden&keep=me'
    )

    const data = JSON.parse(cheerio.load(html)('p').text())
    expect(data).toEqual({
      first: 'first',
      second: 'second',
      section: 'first',
      name: 'second',
      keep: 'me',
    })
  })

  // current routes order do not allow rewrites to override page
  // but allow redirects to
  it('should not allow rewrite to override page file', async () => {
    const html = await renderViaHTTP(appPort, '/nav')
    expect(html).toContain('to-hello')
  })

  it('show allow redirect to override the page', async () => {
    const res = await fetchViaHTTP(appPort, '/redirect-override', undefined, {
      redirect: 'manual',
    })
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(res.status).toBe(307)
    expect(pathname).toBe('/thank-you-next')
  })

  it('should work successfully on the client', async () => {
    const browser = await webdriver(appPort, '/nav')
    await browser.elementByCss('#to-hello').click()
    await browser.waitForElementByCss('#hello')

    expect(await browser.eval('window.location.href')).toMatch(/\/first$/)
    expect(await getBrowserBodyText(browser)).toMatch(/Hello/)

    await browser.eval('window.location.href = window.location.href')
    await waitFor(500)
    expect(await browser.eval('window.location.href')).toMatch(/\/first$/)
    expect(await getBrowserBodyText(browser)).toMatch(/Hello/)

    await browser.elementByCss('#to-nav').click()
    await browser.waitForElementByCss('#to-hello-again')
    await browser.elementByCss('#to-hello-again').click()
    await browser.waitForElementByCss('#hello-again')

    expect(await browser.eval('window.location.href')).toMatch(/\/second$/)
    expect(await getBrowserBodyText(browser)).toMatch(/Hello again/)

    await browser.eval('window.location.href = window.location.href')
    await waitFor(500)
    expect(await browser.eval('window.location.href')).toMatch(/\/second$/)
    expect(await getBrowserBodyText(browser)).toMatch(/Hello again/)
  })

  it('should work with rewrite when manually specifying href/as', async () => {
    const browser = await webdriver(appPort, '/nav')
    await browser.eval('window.beforeNav = 1')
    await browser
      .elementByCss('#to-params-manual')
      .click()
      .waitForElementByCss('#query')

    expect(await browser.eval('window.beforeNav')).toBe(1)
    const query = JSON.parse(await browser.elementByCss('#query').text())
    expect(query).toEqual({
      something: '1',
      another: 'value',
    })
  })

  it('should work with rewrite when only specifying href', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const browser = await webdriver(appPort, '/nav')
    await browser.eval('window.beforeNav = 1')
    await browser
      .elementByCss('#to-params')
      .click()
      .waitForElementByCss('#query')

    expect(await browser.eval('window.beforeNav')).toBe(1)
    const query = JSON.parse(await browser.elementByCss('#query').text())
    expect(query).toEqual({
      something: '1',
      another: 'value',
    })
  })

  it('should work with rewrite when only specifying href and ends in dynamic route', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const browser = await webdriver(appPort, '/nav')
    await browser.eval('window.beforeNav = 1')
    await browser
      .elementByCss('#to-rewritten-dynamic')
      .click()
      .waitForElementByCss('#auto-export')

    expect(await browser.eval('window.beforeNav')).toBe(1)

    const text = await browser.eval(() => document.documentElement.innerHTML)
    expect(text).toContain('auto-export hello')
  })

  it('should match a page after a rewrite', async () => {
    const html = await renderViaHTTP(appPort, '/to-hello')
    expect(html).toContain('Hello')
  })

  it('should match dynamic route after rewrite', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1')
    expect(html).toMatch(/post:.*?post-2/)
  })

  it('should match public file after rewrite', async () => {
    const data = await renderViaHTTP(appPort, '/blog/data.json')
    expect(JSON.parse(data)).toEqual({ hello: 'world' })
  })

  it('should match /_next file after rewrite', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    await renderViaHTTP(appPort, '/hello')
    const data = await renderViaHTTP(
      appPort,
      `/hidden/_next/static/${buildId}/_buildManifest.js`
    )
    expect(data).toContain('/hello')
  })

  it('should allow redirecting to external resource', async () => {
    const res = await fetchViaHTTP(appPort, '/to-external', undefined, {
      redirect: 'manual',
    })
    const location = res.headers.get('location')
    expect(res.status).toBe(307)
    expect(location).toBe('https://google.com/')
  })

  it('should apply headers for exact match', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/add-header')
    expect(res.headers.get('x-custom-header')).toBe('hello world')
    expect(res.headers.get('x-another-header')).toBe('hello again')
  })

  it('should apply headers for multi match', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/my-headers/first')
    expect(res.headers.get('x-first-header')).toBe('first')
    expect(res.headers.get('x-second-header')).toBe('second')
  })

  it('should apply params for header key/values', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/my-other-header/first')
    expect(res.headers.get('x-path')).toBe('first')
    expect(res.headers.get('somefirst')).toBe('hi')
  })

  it('should support URL for header key/values', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/without-params/url')
    expect(res.headers.get('x-origin')).toBe('https://example.com')
  })

  it('should apply params header key/values with URL', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/with-params/url/first')
    expect(res.headers.get('x-url')).toBe('https://example.com/first')
  })

  it('should apply params header key/values with URL that has port', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/with-params/url2/first')
    expect(res.headers.get('x-url')).toBe(
      'https://example.com:8080?hello=first'
    )
  })

  it('should support named pattern for header key/values', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/named-pattern/hello')
    expect(res.headers.get('x-something')).toBe('value=hello')
    expect(res.headers.get('path-hello')).toBe('end')
  })

  it('should support proxying to external resource', async () => {
    const res = await fetchViaHTTP(appPort, '/proxy-me/first?keep=me&and=me')
    expect(res.status).toBe(200)
    expect(
      [...externalServerHits].map((u) => {
        const { pathname, query } = url.parse(u, true)
        return {
          pathname,
          query,
        }
      })
    ).toEqual([
      {
        pathname: '/first',
        query: {
          keep: 'me',
          and: 'me',
        },
      },
    ])
    const nextHost = `localhost:${appPort}`
    const externalHost = `localhost:${externalServerPort}`
    expect(await res.text()).toContain(`hi ${nextHost} from ${externalHost}`)
  })

  it('should support unnamed parameters correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/unnamed/first/final', undefined, {
      redirect: 'manual',
    })
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(res.status).toBe(307)
    expect(pathname).toBe('/got-unnamed')
  })

  it('should support named like unnamed parameters correctly', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/named-like-unnamed/first',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(res.status).toBe(307)
    expect(pathname).toBe('/first')
  })

  it('should add refresh header for 308 redirect', async () => {
    const res = await fetchViaHTTP(appPort, '/redirect4', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(308)
    expect(res.headers.get('refresh')).toBe(`0;url=/`)
  })

  it('should have correctly encoded query in location and refresh headers', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(
      appPort,
      // Query unencoded is ?テスト=あ
      '/redirect4?%E3%83%86%E3%82%B9%E3%83%88=%E3%81%82',
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(308)

    expect(res.headers.get('location').split('?')[1]).toBe(
      '%E3%83%86%E3%82%B9%E3%83%88=%E3%81%82'
    )
    expect(res.headers.get('refresh')).toBe(
      '0;url=/?%E3%83%86%E3%82%B9%E3%83%88=%E3%81%82'
    )
  })

  it('should handle basic api rewrite successfully', async () => {
    const data = await renderViaHTTP(appPort, '/api-hello')
    expect(JSON.parse(data)).toEqual({ query: {} })
  })

  it('should handle api rewrite with un-named param successfully', async () => {
    const data = await renderViaHTTP(appPort, '/api-hello-regex/hello/world')
    expect(JSON.parse(data)).toEqual({
      query: { name: 'hello/world', first: 'hello/world' },
    })
  })

  it('should handle api rewrite with param successfully', async () => {
    const data = await renderViaHTTP(appPort, '/api-hello-param/hello')
    expect(JSON.parse(data)).toEqual({
      query: { name: 'hello', hello: 'hello' },
    })
  })

  it('should handle encoded value in the pathname correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(
      appPort,
      '/redirect/me/to-about/' + encodeURI('\\google.com'),
      undefined,
      {
        redirect: 'manual',
      }
    )

    const { pathname, hostname, query } = url.parse(
      res.headers.get('location') || '',
      true
    )
    expect(res.status).toBe(307)
    expect(pathname).toBe(encodeURI('/\\google.com/about'))
    expect(hostname).not.toBe('google.com')
    expect(query).toEqual({})
  })

  it('should handle unnamed parameters with multi-match successfully', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/unnamed-params/nested/first/second/hello/world'
    )
    const params = JSON.parse(cheerio.load(html)('p').text())
    expect(params).toEqual({ test: 'hello' })
  })

  it('should handle named regex parameters with multi-match successfully', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/docs/integrations/v2-some/thing',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(res.status).toBe(307)
    expect(pathname).toBe('/integrations/-some/thing')
  })

  it('should redirect with URL in query correctly', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/to-external-with-query',
      undefined,
      {
        redirect: 'manual',
      }
    )

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'https://authserver.example.com/set-password?returnUrl=https://www.example.com/login'
    )
  })

  it('should redirect with URL in query correctly non-encoded', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/to-external-with-query',
      undefined,
      {
        redirect: 'manual',
      }
    )

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'https://authserver.example.com/set-password?returnUrl=https://www.example.com/login'
    )
  })

  it('should match missing header headers correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/missing-headers-1', undefined, {
      headers: {
        'x-my-header': 'hello world!!',
      },
    })

    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(appPort, '/missing-headers-1', undefined, {
      redirect: 'manual',
    })
    expect(res2.headers.get('x-new-header')).toBe('new-value')
  })

  it('should match missing query headers correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/missing-headers-2', {
      'my-query': 'hellooo',
    })

    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(appPort, '/missing-headers-2', undefined, {
      redirect: 'manual',
    })
    expect(res2.headers.get('x-new-header')).toBe('new-value')
  })

  it('should match missing cookie headers correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/missing-headers-3', undefined, {
      headers: {
        cookie: 'loggedIn=true',
      },
      redirect: 'manual',
    })

    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(appPort, '/missing-headers-3', undefined, {
      redirect: 'manual',
    })
    expect(res2.headers.get('x-new-header')).toBe('new-value')
  })

  it('should match missing header redirect correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/missing-rewrite-1', undefined, {
      headers: {
        'x-my-header': 'hello world!!',
      },
    })

    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(appPort, '/missing-redirect-1', undefined, {
      redirect: 'manual',
    })
    expect(res2.status).toBe(307)
    const url = new URL(res2.headers.get('location'), 'http://n')
    expect(url.pathname).toBe('/with-params')
  })

  it('should match missing query redirect correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/missing-redirect-2', {
      'my-query': 'hellooo',
    })

    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(appPort, '/missing-redirect-2', undefined, {
      redirect: 'manual',
    })
    expect(res2.status).toBe(307)
    const url = new URL(res2.headers.get('location'), 'http://n')
    expect(url.pathname).toBe('/with-params')
  })

  it('should match missing cookie redirect correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/missing-redirect-3', undefined, {
      headers: {
        cookie: 'loggedIn=true',
      },
      redirect: 'manual',
    })

    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(appPort, '/missing-redirect-3', undefined, {
      redirect: 'manual',
    })
    expect(res2.status).toBe(307)
    const url = new URL(res2.headers.get('location'), 'http://n')
    expect(url.pathname).toBe('/with-params')
    expect(url.search).toBe('?authorized=1')
  })

  it('should match missing header rewrite correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/missing-rewrite-1', undefined, {
      headers: {
        'x-my-header': 'hello world!!',
      },
    })

    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(appPort, '/missing-rewrite-1')
    const $2 = cheerio.load(await res2.text())

    expect(res2.status).toBe(200)
    expect(JSON.parse($2('#query').text())).toEqual({})
  })

  it('should match missing query rewrite correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/missing-rewrite-2', {
      'my-query': 'hellooo',
    })

    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(appPort, '/missing-rewrite-2')
    const $2 = cheerio.load(await res2.text())
    expect(res2.status).toBe(200)
    expect(JSON.parse($2('#query').text())).toEqual({})
  })

  it('should match missing cookie rewrite correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/missing-rewrite-3', undefined, {
      headers: {
        cookie: 'loggedIn=true',
      },
    })

    expect(res.status).toBe(404)

    const res2 = await fetchViaHTTP(appPort, '/missing-rewrite-3')
    const $2 = cheerio.load(await res2.text())
    expect(JSON.parse($2('#query').text())).toEqual({
      authorized: '1',
    })
    expect(res2.status).toBe(200)
  })

  it('should match has header rewrite correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/has-rewrite-1', undefined, {
      headers: {
        'x-my-header': 'hello world!!',
      },
    })

    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())

    expect(JSON.parse($('#query').text())).toEqual({
      myHeader: 'hello world!!',
    })

    const res2 = await fetchViaHTTP(appPort, '/has-rewrite-1')
    expect(res2.status).toBe(404)
  })

  it('should match has query rewrite correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/has-rewrite-2', {
      'my-query': 'hellooo',
    })

    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())

    expect(JSON.parse($('#query').text())).toEqual({
      'my-query': 'hellooo',
      myquery: 'hellooo',
      value: 'hellooo',
    })

    const res2 = await fetchViaHTTP(appPort, '/has-rewrite-2')
    expect(res2.status).toBe(404)
  })

  it('should match has cookie rewrite correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/has-rewrite-3', undefined, {
      headers: {
        cookie: 'loggedIn=true',
      },
    })

    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())

    expect(JSON.parse($('#query').text())).toEqual({
      loggedIn: 'true',
      authorized: '1',
    })

    const res2 = await fetchViaHTTP(appPort, '/has-rewrite-3')
    expect(res2.status).toBe(404)
  })

  it('should match has host rewrite correctly', async () => {
    const res1 = await fetchViaHTTP(appPort, '/has-rewrite-4')
    expect(res1.status).toBe(404)

    const res = await fetchViaHTTP(appPort, '/has-rewrite-4', undefined, {
      headers: {
        host: 'example.com',
      },
    })

    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())

    expect(JSON.parse($('#query').text())).toEqual({
      host: '1',
    })

    const res2 = await fetchViaHTTP(appPort, '/has-rewrite-4')
    expect(res2.status).toBe(404)
  })

  it('should pass has segment for rewrite correctly', async () => {
    const res1 = await fetchViaHTTP(appPort, '/has-rewrite-5')
    expect(res1.status).toBe(404)

    const res = await fetchViaHTTP(appPort, '/has-rewrite-5', {
      hasParam: 'with-params',
    })

    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())

    expect(JSON.parse($('#query').text())).toEqual({
      hasParam: 'with-params',
    })
  })

  it('should not pass non captured has value for rewrite correctly', async () => {
    const res1 = await fetchViaHTTP(appPort, '/has-rewrite-6')
    expect(res1.status).toBe(404)

    const res = await fetchViaHTTP(appPort, '/has-rewrite-6', undefined, {
      headers: {
        hasParam: 'with-params',
      },
    })
    expect(res.status).toBe(200)

    const $ = cheerio.load(await res.text())
    expect(JSON.parse($('#query').text())).toEqual({})
  })

  it('should pass captured has value for rewrite correctly', async () => {
    const res1 = await fetchViaHTTP(appPort, '/has-rewrite-7')
    expect(res1.status).toBe(404)

    const res = await fetchViaHTTP(appPort, '/has-rewrite-7', {
      hasParam: 'with-params',
    })
    expect(res.status).toBe(200)

    const $ = cheerio.load(await res.text())
    expect(JSON.parse($('#query').text())).toEqual({
      hasParam: 'with-params',
      idk: 'with-params',
    })
  })

  it('should match has rewrite correctly before files', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res1 = await fetchViaHTTP(appPort, '/hello')
    expect(res1.status).toBe(200)
    const $1 = cheerio.load(await res1.text())
    expect($1('#hello').text()).toBe('Hello')

    const res = await fetchViaHTTP(appPort, '/hello', { overrideMe: '1' })

    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())

    expect(JSON.parse($('#query').text())).toEqual({
      overrideMe: '1',
      overridden: '1',
    })

    const browser = await webdriver(appPort, '/nav')
    await browser.eval('window.beforeNav = 1')
    await browser.elementByCss('#to-overridden').click()
    await browser.waitForElementByCss('#query')

    expect(await browser.eval('window.next.router.pathname')).toBe(
      '/with-params'
    )
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      overridden: '1',
      overrideMe: '1',
    })
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should match has header redirect correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/has-redirect-1', undefined, {
      headers: {
        'x-my-header': 'hello world!!',
      },
      redirect: 'manual',
    })

    expect(res.status).toBe(307)
    const parsed = url.parse(res.headers.get('location'), true)

    expect(parsed.pathname).toBe('/another')
    expect(parsed.query).toEqual({
      myHeader: 'hello world!!',
    })

    const res2 = await fetchViaHTTP(appPort, '/has-redirect-1', undefined, {
      redirect: 'manual',
    })
    expect(res2.status).toBe(404)
  })

  it('should match has query redirect correctly', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/has-redirect-2',
      {
        'my-query': 'hellooo',
      },
      {
        redirect: 'manual',
      }
    )

    expect(res.status).toBe(307)
    const parsed = url.parse(res.headers.get('location'), true)

    expect(parsed.pathname).toBe('/another')
    expect(parsed.query).toEqual({
      value: 'hellooo',
      'my-query': 'hellooo',
    })

    const res2 = await fetchViaHTTP(appPort, '/has-redirect-2', undefined, {
      redirect: 'manual',
    })
    expect(res2.status).toBe(404)
  })

  it('should match has cookie redirect correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/has-redirect-3', undefined, {
      headers: {
        cookie: 'loggedIn=true',
      },
      redirect: 'manual',
    })

    expect(res.status).toBe(307)
    const parsed = url.parse(res.headers.get('location'), true)

    expect(parsed.pathname).toBe('/another')
    expect(parsed.query).toEqual({
      authorized: '1',
    })

    const res2 = await fetchViaHTTP(appPort, '/has-redirect-3', undefined, {
      redirect: 'manual',
    })
    expect(res2.status).toBe(404)
  })

  it('should match has host redirect correctly', async () => {
    const res1 = await fetchViaHTTP(appPort, '/has-redirect-4', undefined, {
      redirect: 'manual',
    })
    expect(res1.status).toBe(404)

    const res = await fetchViaHTTP(appPort, '/has-redirect-4', undefined, {
      headers: {
        host: 'example.com',
      },
      redirect: 'manual',
    })

    expect(res.status).toBe(307)
    const parsed = url.parse(res.headers.get('location'), true)

    expect(parsed.pathname).toBe('/another')
    expect(parsed.query).toEqual({
      host: '1',
    })
  })

  it('should match has host redirect and insert in destination correctly', async () => {
    const res1 = await fetchViaHTTP(appPort, '/has-redirect-6', undefined, {
      redirect: 'manual',
    })
    expect(res1.status).toBe(404)

    const res = await fetchViaHTTP(appPort, '/has-redirect-6', undefined, {
      headers: {
        host: 'hello-test.example.com',
      },
      redirect: 'manual',
    })

    expect(res.status).toBe(307)
    const parsed = url.parse(res.headers.get('location'), true)

    expect(parsed.protocol).toBe('https:')
    expect(parsed.hostname).toBe('hello.example.com')
    expect(parsed.pathname).toBe('/some-path/end')
    expect(parsed.query).toEqual({
      a: 'b',
    })
  })

  it('should match has query redirect with duplicate query key', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/has-redirect-7',
      '?hello=world&hello=another',
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(307)
    const parsed = url.parse(res.headers.get('location'), true)

    expect(parsed.pathname).toBe('/somewhere')
    expect(parsed.query).toEqual({
      hello: ['world', 'another'],
      value: 'another',
    })
  })

  it('should match has header for header correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/has-header-1', undefined, {
      headers: {
        'x-my-header': 'hello world!!',
      },
      redirect: 'manual',
    })

    expect(res.headers.get('x-another')).toBe('header')

    const res2 = await fetchViaHTTP(appPort, '/has-header-1', undefined, {
      redirect: 'manual',
    })
    expect(res2.headers.get('x-another')).toBe(null)
  })

  it('should match has query for header correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(
      appPort,
      '/has-header-2',
      {
        'my-query': 'hellooo',
      },
      {
        redirect: 'manual',
      }
    )

    expect(res.headers.get('x-added')).toBe('value')

    const res2 = await fetchViaHTTP(appPort, '/has-header-2', undefined, {
      redirect: 'manual',
    })
    expect(res2.headers.get('x-another')).toBe(null)
  })

  it('should match has cookie for header correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/has-header-3', undefined, {
      headers: {
        cookie: 'loggedIn=true',
      },
      redirect: 'manual',
    })

    expect(res.headers.get('x-is-user')).toBe('yuuuup')

    const res2 = await fetchViaHTTP(appPort, '/has-header-3', undefined, {
      redirect: 'manual',
    })
    expect(res2.headers.get('x-is-user')).toBe(null)
  })

  it('should match has host for header correctly', async () => {
    // TODO: remove once test failure has been fixed
    if (isTurbo) return

    const res = await fetchViaHTTP(appPort, '/has-header-4', undefined, {
      headers: {
        host: 'example.com',
      },
      redirect: 'manual',
    })

    expect(res.headers.get('x-is-host')).toBe('yuuuup')

    const res2 = await fetchViaHTTP(appPort, '/has-header-4', undefined, {
      redirect: 'manual',
    })
    expect(res2.headers.get('x-is-host')).toBe(null)
  })

  if (!isDev) {
    it('should output routes-manifest successfully', async () => {
      const manifest = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )

      for (const route of [
        ...manifest.dynamicRoutes,
        ...manifest.rewrites.beforeFiles,
        ...manifest.rewrites.afterFiles,
        ...manifest.rewrites.fallback,
        ...manifest.redirects,
        ...manifest.headers,
      ]) {
        route.regex = normalizeRegEx(route.regex)
      }
      for (const route of manifest.dataRoutes) {
        route.dataRouteRegex = normalizeRegEx(route.dataRouteRegex)
      }

      expect(manifest).toEqual({
        version: 3,
        pages404: true,
        caseSensitive: true,
        basePath: '',
        dataRoutes: [
          {
            dataRouteRegex: normalizeRegEx(
              `^/_next/data/${escapeRegex(
                buildId
              )}/blog\\-catchall/(.+?)\\.json$`
            ),
            namedDataRouteRegex: `^/_next/data/${escapeRegex(
              buildId
            )}/blog\\-catchall/(?<nxtPslug>.+?)\\.json$`,
            page: '/blog-catchall/[...slug]',
            routeKeys: {
              nxtPslug: 'nxtPslug',
            },
          },
          {
            dataRouteRegex: `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/overridden\\/([^\\/]+?)\\.json$`,
            namedDataRouteRegex: `^/_next/data/${escapeRegex(
              buildId
            )}/overridden/(?<nxtPslug>[^/]+?)\\.json$`,
            page: '/overridden/[slug]',
            routeKeys: {
              nxtPslug: 'nxtPslug',
            },
          },
        ],
        redirects: [
          {
            destination: '/:path+',
            regex: normalizeRegEx(
              '^(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))\\/$'
            ),
            source: '/:path+/',
            statusCode: 308,
            internal: true,
          },
          {
            destination: '/with-params',
            missing: [
              {
                key: 'x-my-header',
                type: 'header',
                value: '(?<myHeader>.*)',
              },
            ],
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/missing-redirect-1(?:\\/)?$'
            ),
            source: '/missing-redirect-1',
            statusCode: 307,
          },
          {
            destination: '/with-params',
            missing: [
              {
                key: 'my-query',
                type: 'query',
              },
            ],
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/missing-redirect-2(?:\\/)?$'
            ),
            source: '/missing-redirect-2',
            statusCode: 307,
          },
          {
            destination: '/with-params?authorized=1',
            missing: [
              {
                key: 'loggedIn',
                type: 'cookie',
                value: '(?<loggedIn>true)',
              },
            ],
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/missing-redirect-3(?:\\/)?$'
            ),
            source: '/missing-redirect-3',
            statusCode: 307,
          },
          {
            destination: '/:lang/about',
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/redirect\\/me\\/to-about(?:\\/([^\\/]+?))(?:\\/)?$'
            ),
            source: '/redirect/me/to-about/:lang',
            statusCode: 307,
          },
          {
            source: '/docs/router-status/:code',
            destination: '/docs/v2/network/status-codes#:code',
            statusCode: 301,
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/docs\\/router-status(?:\\/([^\\/]+?))(?:\\/)?$'
            ),
          },
          {
            source: '/docs/github',
            destination: '/docs/v2/advanced/now-for-github',
            statusCode: 301,
            regex: normalizeRegEx('^(?!\\/_next)\\/docs\\/github(?:\\/)?$'),
          },
          {
            source: '/docs/v2/advanced/:all(.*)',
            destination: '/docs/v2/more/:all',
            statusCode: 301,
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/docs\\/v2\\/advanced(?:\\/(.*))(?:\\/)?$'
            ),
          },
          {
            source: '/hello/:id/another',
            destination: '/blog/:id',
            statusCode: 307,
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/hello(?:\\/([^\\/]+?))\\/another(?:\\/)?$'
            ),
          },
          {
            source: '/redirect1',
            destination: '/',
            statusCode: 307,
            regex: normalizeRegEx('^(?!\\/_next)\\/redirect1(?:\\/)?$'),
          },
          {
            source: '/redirect2',
            destination: '/',
            statusCode: 301,
            regex: normalizeRegEx('^(?!\\/_next)\\/redirect2(?:\\/)?$'),
          },
          {
            source: '/redirect3',
            destination: '/another',
            statusCode: 302,
            regex: normalizeRegEx('^(?!\\/_next)\\/redirect3(?:\\/)?$'),
          },
          {
            source: '/redirect4',
            destination: '/',
            statusCode: 308,
            regex: normalizeRegEx('^(?!\\/_next)\\/redirect4(?:\\/)?$'),
          },
          {
            source: '/redir-chain1',
            destination: '/redir-chain2',
            statusCode: 301,
            regex: normalizeRegEx('^(?!\\/_next)\\/redir-chain1(?:\\/)?$'),
          },
          {
            source: '/redir-chain2',
            destination: '/redir-chain3',
            statusCode: 302,
            regex: normalizeRegEx('^(?!\\/_next)\\/redir-chain2(?:\\/)?$'),
          },
          {
            source: '/redir-chain3',
            destination: '/',
            statusCode: 303,
            regex: normalizeRegEx('^(?!\\/_next)\\/redir-chain3(?:\\/)?$'),
          },
          {
            destination: 'https://google.com',
            regex: normalizeRegEx('^(?!\\/_next)\\/to-external(?:\\/)?$'),
            source: '/to-external',
            statusCode: 307,
          },
          {
            destination: '/with-params?first=:section&second=:name',
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/query-redirect(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))(?:\\/)?$'
            ),
            source: '/query-redirect/:section/:name',
            statusCode: 307,
          },
          {
            destination: '/got-unnamed',
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/unnamed(?:\\/(first|second))(?:\\/(.*))(?:\\/)?$'
            ),
            source: '/unnamed/(first|second)/(.*)',
            statusCode: 307,
          },
          {
            destination: '/:0',
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/named-like-unnamed(?:\\/([^\\/]+?))(?:\\/)?$'
            ),
            source: '/named-like-unnamed/:0',
            statusCode: 307,
          },
          {
            destination: '/thank-you-next',
            regex: normalizeRegEx('^(?!\\/_next)\\/redirect-override(?:\\/)?$'),
            source: '/redirect-override',
            statusCode: 307,
          },
          {
            destination: '/:first/:second',
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/docs(?:\\/(integrations|now-cli))\\/v2(.*)(?:\\/)?$'
            ),
            source: '/docs/:first(integrations|now-cli)/v2:second(.*)',
            statusCode: 307,
          },
          {
            destination: '/somewhere',
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/catchall-redirect(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
            ),
            source: '/catchall-redirect/:path*',
            statusCode: 307,
          },
          {
            destination:
              'https://authserver.example.com/set-password?returnUrl=https%3A%2F%2Fwww.example.com/login',
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/to-external-with-query(?:\\/)?$'
            ),
            source: '/to-external-with-query',
            statusCode: 307,
          },
          {
            destination:
              'https://authserver.example.com/set-password?returnUrl=https://www.example.com/login',
            regex: normalizeRegEx(
              '^(?!\\/_next)\\/to-external-with-query-2(?:\\/)?$'
            ),
            source: '/to-external-with-query-2',
            statusCode: 307,
          },
          {
            destination: '/another?myHeader=:myHeader',
            has: [
              {
                key: 'x-my-header',
                type: 'header',
                value: '(?<myHeader>.*)',
              },
            ],
            regex: normalizeRegEx('^(?!\\/_next)\\/has-redirect-1(?:\\/)?$'),
            source: '/has-redirect-1',
            statusCode: 307,
          },
          {
            destination: '/another?value=:myquery',
            has: [
              {
                key: 'my-query',
                type: 'query',
              },
            ],
            regex: normalizeRegEx('^(?!\\/_next)\\/has-redirect-2(?:\\/)?$'),
            source: '/has-redirect-2',
            statusCode: 307,
          },
          {
            destination: '/another?authorized=1',
            has: [
              {
                key: 'loggedIn',
                type: 'cookie',
                value: 'true',
              },
            ],
            regex: normalizeRegEx('^(?!\\/_next)\\/has-redirect-3(?:\\/)?$'),
            source: '/has-redirect-3',
            statusCode: 307,
          },
          {
            destination: '/another?host=1',
            has: [
              {
                type: 'host',
                value: 'example.com',
              },
            ],
            regex: normalizeRegEx('^(?!\\/_next)\\/has-redirect-4(?:\\/)?$'),
            source: '/has-redirect-4',
            statusCode: 307,
          },
          {
            destination: '/somewhere',
            has: [
              {
                key: 'x-test-next',
                type: 'header',
              },
            ],
            regex: normalizeRegEx(
              '^(?!\\/_next)(?:\\/([^\\/]+?))\\/has-redirect-5(?:\\/)?$'
            ),
            source: '/:path/has-redirect-5',
            statusCode: 307,
          },
          {
            destination: 'https://:subdomain.example.com/some-path/end?a=b',
            has: [
              {
                type: 'host',
                value: '(?<subdomain>.*)-test.example.com',
              },
            ],
            regex: normalizeRegEx('^(?!\\/_next)\\/has-redirect-6(?:\\/)?$'),
            source: '/has-redirect-6',
            statusCode: 307,
          },
          {
            source: '/has-redirect-7',
            regex: normalizeRegEx('^(?!\\/_next)\\/has-redirect-7(?:\\/)?$'),
            has: [
              {
                type: 'query',
                key: 'hello',
                value: '(?<hello>.*)',
              },
            ],
            destination: '/somewhere?value=:hello',
            statusCode: 307,
          },
        ],
        headers: [
          {
            headers: [
              {
                key: 'x-new-header',
                value: 'new-value',
              },
            ],
            missing: [
              {
                key: 'x-my-header',
                type: 'header',
                value: '(?<myHeader>.*)',
              },
            ],
            regex: normalizeRegEx('^\\/missing-headers-1(?:\\/)?$'),
            source: '/missing-headers-1',
          },
          {
            headers: [
              {
                key: 'x-new-header',
                value: 'new-value',
              },
            ],
            missing: [
              {
                key: 'my-query',
                type: 'query',
              },
            ],
            regex: normalizeRegEx('^\\/missing-headers-2(?:\\/)?$'),
            source: '/missing-headers-2',
          },
          {
            headers: [
              {
                key: 'x-new-header',
                value: 'new-value',
              },
            ],
            missing: [
              {
                key: 'loggedIn',
                type: 'cookie',
                value: '(?<loggedIn>true)',
              },
            ],
            regex: normalizeRegEx('^\\/missing-headers-3(?:\\/)?$'),
            source: '/missing-headers-3',
          },
          {
            headers: [
              {
                key: 'x-custom-header',
                value: 'hello world',
              },
              {
                key: 'x-another-header',
                value: 'hello again',
              },
            ],
            regex: normalizeRegEx('^\\/add-header(?:\\/)?$'),
            source: '/add-header',
          },
          {
            headers: [
              {
                key: 'x-first-header',
                value: 'first',
              },
              {
                key: 'x-second-header',
                value: 'second',
              },
            ],
            regex: normalizeRegEx('^\\/my-headers(?:\\/(.*))(?:\\/)?$'),
            source: '/my-headers/(.*)',
          },
          {
            headers: [
              {
                key: 'x-path',
                value: ':path',
              },
              {
                key: 'some:path',
                value: 'hi',
              },
              {
                key: 'x-test',
                value: 'some:value*',
              },
              {
                key: 'x-test-2',
                value: 'value*',
              },
              {
                key: 'x-test-3',
                value: ':value?',
              },
              {
                key: 'x-test-4',
                value: ':value+',
              },
              {
                key: 'x-test-5',
                value: 'something https:',
              },
              {
                key: 'x-test-6',
                value: ':hello(world)',
              },
              {
                key: 'x-test-7',
                value: 'hello(world)',
              },
              {
                key: 'x-test-8',
                value: 'hello{1,}',
              },
              {
                key: 'x-test-9',
                value: ':hello{1,2}',
              },
              {
                key: 'content-security-policy',
                value:
                  "default-src 'self'; img-src *; media-src media1.com media2.com; script-src userscripts.example.com/:path",
              },
            ],
            regex: normalizeRegEx(
              '^\\/my-other-header(?:\\/([^\\/]+?))(?:\\/)?$'
            ),
            source: '/my-other-header/:path',
          },
          {
            headers: [
              {
                key: 'x-origin',
                value: 'https://example.com',
              },
            ],
            regex: normalizeRegEx('^\\/without-params\\/url(?:\\/)?$'),
            source: '/without-params/url',
          },
          {
            headers: [
              {
                key: 'x-url',
                value: 'https://example.com/:path*',
              },
            ],
            regex: normalizeRegEx(
              '^\\/with-params\\/url(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
            ),
            source: '/with-params/url/:path*',
          },
          {
            headers: [
              {
                key: 'x-url',
                value: 'https://example.com:8080?hello=:path*',
              },
            ],
            regex: normalizeRegEx(
              '^\\/with-params\\/url2(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
            ),
            source: '/with-params/url2/:path*',
          },
          {
            headers: [
              {
                key: 'x-something',
                value: 'applied-everywhere',
              },
            ],
            regex: normalizeRegEx(
              '^(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
            ),
            source: '/:path*',
          },
          {
            headers: [
              {
                key: 'x-something',
                value: 'value=:path',
              },
              {
                key: 'path-:path',
                value: 'end',
              },
            ],
            regex: normalizeRegEx('^\\/named-pattern(?:\\/(.*))(?:\\/)?$'),
            source: '/named-pattern/:path(.*)',
          },
          {
            headers: [
              {
                key: 'x-value',
                value: ':path*',
              },
            ],
            regex: normalizeRegEx(
              '^\\/catchall-header(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
            ),
            source: '/catchall-header/:path*',
          },
          {
            has: [
              {
                key: 'x-my-header',
                type: 'header',
                value: '(?<myHeader>.*)',
              },
            ],
            headers: [
              {
                key: 'x-another',
                value: 'header',
              },
            ],
            regex: normalizeRegEx('^\\/has-header-1(?:\\/)?$'),
            source: '/has-header-1',
          },
          {
            has: [
              {
                key: 'my-query',
                type: 'query',
              },
            ],
            headers: [
              {
                key: 'x-added',
                value: 'value',
              },
            ],
            regex: normalizeRegEx('^\\/has-header-2(?:\\/)?$'),
            source: '/has-header-2',
          },
          {
            has: [
              {
                key: 'loggedIn',
                type: 'cookie',
                value: 'true',
              },
            ],
            headers: [
              {
                key: 'x-is-user',
                value: 'yuuuup',
              },
            ],
            regex: normalizeRegEx('^\\/has-header-3(?:\\/)?$'),
            source: '/has-header-3',
          },
          {
            has: [
              {
                type: 'host',
                value: 'example.com',
              },
            ],
            headers: [
              {
                key: 'x-is-host',
                value: 'yuuuup',
              },
            ],
            regex: normalizeRegEx('^\\/has-header-4(?:\\/)?$'),
            source: '/has-header-4',
          },
        ],
        rewrites: {
          beforeFiles: [
            {
              destination: '/with-params?overridden=1',
              has: [
                {
                  key: 'overrideMe',
                  type: 'query',
                },
              ],
              regex: normalizeRegEx('^\\/hello(?:\\/)?$'),
              source: '/hello',
            },
            {
              destination: '/blog/:path*',
              regex: normalizeRegEx(
                '^\\/old-blog(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
              ),
              source: '/old-blog/:path*',
            },
            {
              destination: 'https://example.vercel.sh',
              regex: normalizeRegEx('^\\/overridden(?:\\/)?$'),
              source: '/overridden',
            },
            {
              destination: '/_sport/nfl/:path*',
              regex: normalizeRegEx(
                '^\\/nfl(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
              ),
              source: '/nfl/:path*',
            },
          ],
          afterFiles: [
            {
              destination: `http://localhost:${externalServerPort}/_next/webpack-hmr?page=/about`,
              regex: normalizeRegEx('^\\/to-websocket(?:\\/)?$'),
              source: '/to-websocket',
            },
            {
              destination: '/hello',
              regex: normalizeRegEx('^\\/websocket-to-page(?:\\/)?$'),
              source: '/websocket-to-page',
            },
            {
              destination: 'http://localhost:12233',
              regex: normalizeRegEx('^\\/to-nowhere(?:\\/)?$'),
              source: '/to-nowhere',
            },
            {
              destination: '/auto-export/hello?rewrite=1',
              regex: normalizeRegEx('^\\/rewriting-to-auto-export(?:\\/)?$'),
              source: '/rewriting-to-auto-export',
            },
            {
              destination: '/auto-export/another?rewrite=1',
              regex: normalizeRegEx(
                '^\\/rewriting-to-another-auto-export(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
              ),
              source: '/rewriting-to-another-auto-export/:path*',
            },
            {
              destination: '/another/one',
              regex: normalizeRegEx('^\\/to-another(?:\\/)?$'),
              source: '/to-another',
            },
            {
              destination: '/404',
              regex: normalizeRegEx('^\\/nav(?:\\/)?$'),
              source: '/nav',
            },
            {
              source: '/hello-world',
              destination: '/static/hello.txt',
              regex: normalizeRegEx('^\\/hello-world(?:\\/)?$'),
            },
            {
              source: '/',
              destination: '/another',
              regex: normalizeRegEx('^\\/(?:\\/)?$'),
            },
            {
              source: '/another',
              destination: '/multi-rewrites',
              regex: normalizeRegEx('^\\/another(?:\\/)?$'),
            },
            {
              source: '/first',
              destination: '/hello',
              regex: normalizeRegEx('^\\/first(?:\\/)?$'),
            },
            {
              source: '/second',
              destination: '/hello-again',
              regex: normalizeRegEx('^\\/second(?:\\/)?$'),
            },
            {
              destination: '/hello',
              regex: normalizeRegEx('^\\/to-hello(?:\\/)?$'),
              source: '/to-hello',
            },
            {
              destination: '/blog/post-2',
              regex: normalizeRegEx('^\\/blog\\/post-1(?:\\/)?$'),
              source: '/blog/post-1',
            },
            {
              source: '/test/:path',
              destination: '/:path',
              regex: normalizeRegEx('^\\/test(?:\\/([^\\/]+?))(?:\\/)?$'),
            },
            {
              source: '/test-overwrite/:something/:another',
              destination: '/params/this-should-be-the-value',
              regex: normalizeRegEx(
                '^\\/test-overwrite(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))(?:\\/)?$'
              ),
            },
            {
              source: '/params/:something',
              destination: '/with-params',
              regex: normalizeRegEx('^\\/params(?:\\/([^\\/]+?))(?:\\/)?$'),
            },
            {
              destination: '/with-params?first=:section&second=:name',
              regex: normalizeRegEx(
                '^\\/query-rewrite(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))(?:\\/)?$'
              ),
              source: '/query-rewrite/:section/:name',
            },
            {
              destination: '/_next/:path*',
              regex: normalizeRegEx(
                '^\\/hidden\\/_next(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
              ),
              source: '/hidden/_next/:path*',
            },
            {
              destination: `http://localhost:${externalServerPort}/:path*`,
              regex: normalizeRegEx(
                '^\\/proxy-me(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
              ),
              source: '/proxy-me/:path*',
            },
            {
              destination: '/api/hello',
              regex: normalizeRegEx('^\\/api-hello(?:\\/)?$'),
              source: '/api-hello',
            },
            {
              destination: '/api/hello?name=:first*',
              regex: normalizeRegEx('^\\/api-hello-regex(?:\\/(.*))(?:\\/)?$'),
              source: '/api-hello-regex/:first(.*)',
            },
            {
              destination: '/api/hello?hello=:name',
              regex: normalizeRegEx(
                '^\\/api-hello-param(?:\\/([^\\/]+?))(?:\\/)?$'
              ),
              source: '/api-hello-param/:name',
            },
            {
              destination: '/api/dynamic/:name?hello=:name',
              regex: normalizeRegEx(
                '^\\/api-dynamic-param(?:\\/([^\\/]+?))(?:\\/)?$'
              ),
              source: '/api-dynamic-param/:name',
            },
            {
              destination: '/with-params',
              regex: normalizeRegEx('^(?:\\/([^\\/]+?))\\/post-321(?:\\/)?$'),
              source: '/:path/post-321',
            },
            {
              destination: '/with-params',
              regex: normalizeRegEx(
                '^\\/unnamed-params\\/nested(?:\\/(.*))(?:\\/([^\\/]+?))(?:\\/(.*))(?:\\/)?$'
              ),
              source: '/unnamed-params/nested/(.*)/:test/(.*)',
            },
            {
              destination: '/with-params',
              regex: normalizeRegEx(
                '^\\/catchall-rewrite(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
              ),
              source: '/catchall-rewrite/:path*',
            },
            {
              destination: '/with-params?another=:path*',
              regex: normalizeRegEx(
                '^\\/catchall-query(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$'
              ),
              source: '/catchall-query/:path*',
            },
            {
              destination: '/with-params?myHeader=:myHeader',
              has: [
                {
                  key: 'x-my-header',
                  type: 'header',
                  value: '(?<myHeader>.*)',
                },
              ],
              regex: normalizeRegEx('^\\/has-rewrite-1(?:\\/)?$'),
              source: '/has-rewrite-1',
            },
            {
              destination: '/with-params?value=:myquery',
              has: [
                {
                  key: 'my-query',
                  type: 'query',
                },
              ],
              regex: normalizeRegEx('^\\/has-rewrite-2(?:\\/)?$'),
              source: '/has-rewrite-2',
            },
            {
              destination: '/with-params?authorized=1',
              has: [
                {
                  key: 'loggedIn',
                  type: 'cookie',
                  value: '(?<loggedIn>true)',
                },
              ],
              regex: normalizeRegEx('^\\/has-rewrite-3(?:\\/)?$'),
              source: '/has-rewrite-3',
            },
            {
              destination: '/with-params?host=1',
              has: [
                {
                  type: 'host',
                  value: 'example.com',
                },
              ],
              regex: normalizeRegEx('^\\/has-rewrite-4(?:\\/)?$'),
              source: '/has-rewrite-4',
            },
            {
              destination: '/:hasParam',
              has: [
                {
                  key: 'hasParam',
                  type: 'query',
                },
              ],
              regex: normalizeRegEx('^\\/has-rewrite-5(?:\\/)?$'),
              source: '/has-rewrite-5',
            },
            {
              destination: '/with-params',
              has: [
                {
                  key: 'hasParam',
                  type: 'header',
                  value: 'with-params',
                },
              ],
              regex: normalizeRegEx('^\\/has-rewrite-6(?:\\/)?$'),
              source: '/has-rewrite-6',
            },
            {
              destination: '/with-params?idk=:idk',
              has: [
                {
                  key: 'hasParam',
                  type: 'query',
                  value: '(?<idk>with-params|hello)',
                },
              ],
              regex: normalizeRegEx('^\\/has-rewrite-7(?:\\/)?$'),
              source: '/has-rewrite-7',
            },
            {
              destination: '/blog-catchall/:post',
              has: [
                {
                  key: 'post',
                  type: 'query',
                },
              ],
              regex: normalizeRegEx('^\\/has-rewrite-8(?:\\/)?$'),
              source: '/has-rewrite-8',
            },
            {
              destination: '/with-params',
              missing: [
                {
                  key: 'x-my-header',
                  type: 'header',
                  value: '(?<myHeader>.*)',
                },
              ],
              regex: normalizeRegEx('^\\/missing-rewrite-1(?:\\/)?$'),
              source: '/missing-rewrite-1',
            },
            {
              destination: '/with-params',
              missing: [
                {
                  key: 'my-query',
                  type: 'query',
                },
              ],
              regex: normalizeRegEx('^\\/missing-rewrite-2(?:\\/)?$'),
              source: '/missing-rewrite-2',
            },
            {
              destination: '/with-params?authorized=1',
              missing: [
                {
                  key: 'loggedIn',
                  type: 'cookie',
                  value: '(?<loggedIn>true)',
                },
              ],
              regex: normalizeRegEx('^\\/missing-rewrite-3(?:\\/)?$'),
              source: '/missing-rewrite-3',
            },
            {
              destination: '/hello',
              regex: normalizeRegEx('^\\/blog\\/about(?:\\/)?$'),
              source: '/blog/about',
            },
            {
              destination: '/overridden',
              regex:
                '^\\/overridden(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$',
              source: '/overridden/:path*',
            },
          ],
          fallback: [],
        },
        dynamicRoutes: [
          {
            namedRegex: '^/_sport/(?<nxtPslug>[^/]+?)(?:/)?$',
            page: '/_sport/[slug]',
            regex: normalizeRegEx('^\\/_sport\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              nxtPslug: 'nxtPslug',
            },
          },
          {
            namedRegex: '^/_sport/(?<nxtPslug>[^/]+?)/test(?:/)?$',
            page: '/_sport/[slug]/test',
            regex: normalizeRegEx('^\\/_sport\\/([^\\/]+?)\\/test(?:\\/)?$'),
            routeKeys: {
              nxtPslug: 'nxtPslug',
            },
          },
          {
            namedRegex: '^/another/(?<nxtPid>[^/]+?)(?:/)?$',
            page: '/another/[id]',
            regex: normalizeRegEx('^\\/another\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              nxtPid: 'nxtPid',
            },
          },
          {
            namedRegex: '^/api/dynamic/(?<nxtPslug>[^/]+?)(?:/)?$',
            page: '/api/dynamic/[slug]',
            regex: normalizeRegEx('^\\/api\\/dynamic\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              nxtPslug: 'nxtPslug',
            },
          },
          {
            namedRegex: '^/auto\\-export/(?<nxtPslug>[^/]+?)(?:/)?$',
            page: '/auto-export/[slug]',
            regex: normalizeRegEx('^\\/auto\\-export\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              nxtPslug: 'nxtPslug',
            },
          },
          {
            namedRegex: '^/blog/(?<nxtPpost>[^/]+?)(?:/)?$',
            page: '/blog/[post]',
            regex: normalizeRegEx('^\\/blog\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              nxtPpost: 'nxtPpost',
            },
          },
          {
            namedRegex: '^/blog\\-catchall/(?<nxtPslug>.+?)(?:/)?$',
            page: '/blog-catchall/[...slug]',
            regex: normalizeRegEx('^\\/blog\\-catchall\\/(.+?)(?:\\/)?$'),
            routeKeys: {
              nxtPslug: 'nxtPslug',
            },
          },
          {
            namedRegex: '^/overridden/(?<nxtPslug>[^/]+?)(?:/)?$',
            page: '/overridden/[slug]',
            regex: '^\\/overridden\\/([^\\/]+?)(?:\\/)?$',
            routeKeys: {
              nxtPslug: 'nxtPslug',
            },
          },
        ],
        staticRoutes: [
          {
            namedRegex: '^/auto\\-export/another(?:/)?$',
            page: '/auto-export/another',
            regex: '^/auto\\-export/another(?:/)?$',
            routeKeys: {},
          },
          {
            namedRegex: '^/docs/v2/more/now\\-for\\-github(?:/)?$',
            page: '/docs/v2/more/now-for-github',
            regex: '^/docs/v2/more/now\\-for\\-github(?:/)?$',
            routeKeys: {},
          },
          {
            namedRegex: '^/hello(?:/)?$',
            page: '/hello',
            regex: '^/hello(?:/)?$',
            routeKeys: {},
          },
          {
            namedRegex: '^/hello\\-again(?:/)?$',
            page: '/hello-again',
            regex: '^/hello\\-again(?:/)?$',
            routeKeys: {},
          },
          {
            namedRegex: '^/multi\\-rewrites(?:/)?$',
            page: '/multi-rewrites',
            regex: '^/multi\\-rewrites(?:/)?$',
            routeKeys: {},
          },
          {
            namedRegex: '^/nav(?:/)?$',
            page: '/nav',
            regex: '^/nav(?:/)?$',
            routeKeys: {},
          },
          {
            namedRegex: '^/overridden(?:/)?$',
            page: '/overridden',
            regex: '^/overridden(?:/)?$',
            routeKeys: {},
          },
          {
            namedRegex: '^/redirect\\-override(?:/)?$',
            page: '/redirect-override',
            regex: '^/redirect\\-override(?:/)?$',
            routeKeys: {},
          },
          {
            namedRegex: '^/with\\-params(?:/)?$',
            page: '/with-params',
            regex: '^/with\\-params(?:/)?$',
            routeKeys: {},
          },
        ],
        rsc: {
          header: 'RSC',
          contentTypeHeader: 'text/x-component',
          varyHeader: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
        },
      })
    })

    it('should have redirects/rewrites in build output with debug flag', async () => {
      const manifest = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )
      const cleanStdout = stripAnsi(stdout)
      expect(cleanStdout).toContain('Redirects')
      expect(cleanStdout).toContain('Rewrites')
      expect(cleanStdout).toContain('Headers')
      expect(cleanStdout).toMatch(/source.*?/i)
      expect(cleanStdout).toMatch(/destination.*?/i)

      for (const route of [
        ...manifest.redirects,
        ...manifest.rewrites.beforeFiles,
        ...manifest.rewrites.afterFiles,
        ...manifest.rewrites.fallback,
      ]) {
        expect(cleanStdout).toContain(route.source)
        expect(cleanStdout).toContain(route.destination)
      }

      for (const route of manifest.headers) {
        expect(cleanStdout).toContain(route.source)

        for (const header of route.headers) {
          expect(cleanStdout).toContain(header.key)
          expect(cleanStdout).toContain(header.value)
        }
      }
    })
  }
}

describe('Custom routes', () => {
  beforeEach(() => {
    externalServerHits = new Set()
  })
  beforeAll(async () => {
    externalServerPort = await findPort()
    externalServer = http.createServer((req, res) => {
      externalServerHits.add(req.url)
      const nextHost = req.headers['x-forwarded-host']
      const externalHost = req.headers['host']
      res.end(`hi ${nextHost} from ${externalHost}`)
    })
    const wsServer = new WebSocket.Server({ noServer: true })

    externalServer.on('upgrade', (req, socket, head) => {
      externalServerHits.add(req.url)
      wsServer.handleUpgrade(req, socket, head, (client) => {
        client.send('hello world')
      })
    })
    await new Promise((resolve, reject) => {
      externalServer.listen(externalServerPort, (error) => {
        if (error) return reject(error)
        resolve()
      })
    })
    nextConfigRestoreContent = await fs.readFile(nextConfigPath, 'utf8')
    await fs.writeFile(
      nextConfigPath,
      nextConfigRestoreContent.replace(/__EXTERNAL_PORT__/g, externalServerPort)
    )
  })
  afterAll(async () => {
    externalServer.close()
    await fs.writeFile(nextConfigPath, nextConfigRestoreContent)
  })

  describe('dev mode', () => {
    let nextConfigContent

    beforeAll(async () => {
      // ensure cache with rewrites disabled doesn't persist
      // after enabling rewrites
      await fs.remove(join(appDir, '.next'))
      nextConfigContent = await fs.readFile(nextConfigPath, 'utf8')
      await fs.writeFile(
        nextConfigPath,
        nextConfigContent.replace('// no-rewrites comment', 'return []')
      )

      const tempPort = await findPort()
      const tempApp = await launchApp(appDir, tempPort)
      await renderViaHTTP(tempPort, '/')

      await killApp(tempApp)
      await fs.writeFile(nextConfigPath, nextConfigContent)

      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      buildId = 'development'
    })
    afterAll(async () => {
      await fs.writeFile(nextConfigPath, nextConfigContent)
      await killApp(app)
    })
    runTests(true)
  })

  describe('no-op rewrite', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: {
          ADD_NOOP_REWRITE: 'true',
        },
      })
    })
    afterAll(() => killApp(app))

    it('should not error for no-op rewrite and auto export dynamic route', async () => {
      const browser = await webdriver(appPort, '/auto-export/my-slug')
      await check(
        () => browser.eval(() => document.documentElement.innerHTML),
        /auto-export.*?my-slug/
      )
    })
  })

  describe('server mode', () => {
    beforeAll(async () => {
      const { stdout: buildStdout, stderr: buildStderr } = await nextBuild(
        appDir,
        ['-d'],
        {
          stdout: true,
          stderr: true,
        }
      )
      stdout = buildStdout
      stderr = buildStderr
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))
    runTests()

    it('should not show warning for custom routes when not next export', async () => {
      expect(stderr).not.toContain(
        `rewrites, redirects, and headers are not applied when exporting your application detected`
      )
    })

    it('should not show warning for experimental has usage', async () => {
      expect(stderr).not.toContain(
        "'has' route field support is still experimental and not covered by semver, use at your own risk."
      )
    })
  })

  describe('export', () => {
    let exportStderr = ''
    let exportVercelStderr = ''

    beforeAll(async () => {
      const { stdout: buildStdout, stderr: buildStderr } = await nextBuild(
        appDir,
        ['-d'],
        {
          stdout: true,
          stderr: true,
        }
      )
      const exportResult = await nextExport(
        appDir,
        { outdir: join(appDir, 'out') },
        { stderr: true }
      )
      const exportVercelResult = await nextExport(
        appDir,
        { outdir: join(appDir, 'out') },
        {
          stderr: true,
          env: {
            NOW_BUILDER: '1',
          },
        }
      )

      stdout = buildStdout
      stderr = buildStderr
      exportStderr = exportResult.stderr
      exportVercelStderr = exportVercelResult.stderr
    })

    it('should not show warning for custom routes when not next export', async () => {
      expect(stderr).not.toContain(
        `rewrites, redirects, and headers are not applied when exporting your application detected`
      )
    })

    it('should not show warning for custom routes when next export on Vercel', async () => {
      expect(exportVercelStderr).not.toContain(
        `rewrites, redirects, and headers are not applied when exporting your application detected`
      )
    })

    it('should show warning for custom routes with next export', async () => {
      expect(exportStderr).toContain(
        `rewrites, redirects, and headers are not applied when exporting your application, detected (rewrites, redirects, headers)`
      )
    })
  })

  describe('should load custom routes when only one type is used', () => {
    const runSoloTests = (isDev) => {
      const buildAndStart = async () => {
        if (isDev) {
          appPort = await findPort()
          app = await launchApp(appDir, appPort)
        } else {
          const { code } = await nextBuild(appDir)
          if (code !== 0) throw new Error(`failed to build, got code ${code}`)
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
        }
      }

      it('should work with just headers', async () => {
        nextConfigContent = await fs.readFile(nextConfigPath, 'utf8')
        await fs.writeFile(
          nextConfigPath,
          nextConfigContent.replace(/(async (?:redirects|rewrites))/g, '$1s')
        )
        await buildAndStart()

        const res = await fetchViaHTTP(appPort, '/add-header')

        const res2 = await fetchViaHTTP(appPort, '/docs/github', undefined, {
          redirect: 'manual',
        })
        const res3 = await fetchViaHTTP(appPort, '/hello-world')

        await fs.writeFile(nextConfigPath, nextConfigContent)
        await killApp(app)

        expect(res.headers.get('x-custom-header')).toBe('hello world')
        expect(res.headers.get('x-another-header')).toBe('hello again')

        expect(res2.status).toBe(404)
        expect(res3.status).toBe(404)
      })

      it('should work with just rewrites', async () => {
        nextConfigContent = await fs.readFile(nextConfigPath, 'utf8')
        await fs.writeFile(
          nextConfigPath,
          nextConfigContent.replace(/(async (?:redirects|headers))/g, '$1s')
        )
        await buildAndStart()

        const res = await fetchViaHTTP(appPort, '/add-header')

        const res2 = await fetchViaHTTP(appPort, '/docs/github', undefined, {
          redirect: 'manual',
        })
        const res3 = await fetchViaHTTP(appPort, '/hello-world')

        await fs.writeFile(nextConfigPath, nextConfigContent)
        await killApp(app)

        expect(res.headers.get('x-custom-header')).toBeFalsy()
        expect(res.headers.get('x-another-header')).toBeFalsy()

        expect(res2.status).toBe(404)

        expect(res3.status).toBe(200)
        expect(await res3.text()).toContain('hello world!')
      })

      it('should work with just redirects', async () => {
        nextConfigContent = await fs.readFile(nextConfigPath, 'utf8')
        await fs.writeFile(
          nextConfigPath,
          nextConfigContent.replace(/(async (?:rewrites|headers))/g, '$1s')
        )
        await buildAndStart()

        const res = await fetchViaHTTP(appPort, '/add-header')

        const res2 = await fetchViaHTTP(appPort, '/docs/github', undefined, {
          redirect: 'manual',
        })
        const res3 = await fetchViaHTTP(appPort, '/hello world')

        await fs.writeFile(nextConfigPath, nextConfigContent)
        await killApp(app)

        expect(res.headers.get('x-custom-header')).toBeFalsy()
        expect(res.headers.get('x-another-header')).toBeFalsy()

        const { pathname } = url.parse(res2.headers.get('location'))
        expect(res2.status).toBe(301)
        expect(pathname).toBe('/docs/v2/advanced/now-for-github')

        expect(res3.status).toBe(404)
      })
    }

    describe('dev mode', () => {
      runSoloTests(true)
    })

    describe('production mode', () => {
      runSoloTests()
    })
  })
})
