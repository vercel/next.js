/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join, dirname } from 'path'
import fs from 'fs-extra'
import url from 'url'
import {
  assertHasRedbox,
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  nextBuild,
  nextStart,
  normalizeRegEx,
  check,
  getRedboxHeader,
  normalizeManifest,
} from 'next-test-utils'
import cheerio from 'cheerio'

let app
let appPort
let buildId
const appDir = join(__dirname, '../')
const buildIdPath = join(appDir, '.next/BUILD_ID')

function runTests({ dev }) {
  if (!dev) {
    it('should have correct cache entries on prefetch', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.waitForCondition('!!window.next.router.isReady')

      const getCacheKeys = async () => {
        return (await browser.eval('Object.keys(window.next.router.sdc)'))
          .map((key) => {
            // strip http://localhost:PORT
            // and then strip buildId prefix
            return key
              .substring(key.indexOf('/_next'))
              .replace(/\/_next\/data\/(.*?)\//, '/_next/data/BUILD_ID/')
          })
          .sort()
      }

      const cacheKeys = await getCacheKeys()
      expect(cacheKeys).toEqual(
        process.env.__MIDDLEWARE_TEST
          ? [
              '/_next/data/BUILD_ID/[name].json?another=value&name=%5Bname%5D',
              '/_next/data/BUILD_ID/added-later/first.json?name=added-later&comment=first',
              '/_next/data/BUILD_ID/blog/321/comment/123.json?name=321&id=123',
              '/_next/data/BUILD_ID/d/dynamic-1.json?id=dynamic-1',
              '/_next/data/BUILD_ID/on-mount/test-w-hash.json?post=test-w-hash',
              '/_next/data/BUILD_ID/p1/p2/all-ssg/hello.json?rest=hello',
              '/_next/data/BUILD_ID/p1/p2/all-ssg/hello1/hello2.json?rest=hello1&rest=hello2',
              '/_next/data/BUILD_ID/p1/p2/all-ssr/:42.json?rest=%3A42',
              '/_next/data/BUILD_ID/p1/p2/all-ssr/hello.json?rest=hello',
              '/_next/data/BUILD_ID/p1/p2/all-ssr/hello1%2F/he%2Fllo2.json?rest=hello1%2F&rest=he%2Fllo2',
              '/_next/data/BUILD_ID/p1/p2/all-ssr/hello1/hello2.json?rest=hello1&rest=hello2',
              '/_next/data/BUILD_ID/p1/p2/nested-all-ssg/hello.json?rest=hello',
              '/_next/data/BUILD_ID/p1/p2/nested-all-ssg/hello1/hello2.json?rest=hello1&rest=hello2',
              '/_next/data/BUILD_ID/post-1.json?fromHome=true&name=post-1',
              '/_next/data/BUILD_ID/post-1.json?hidden=value&name=post-1',
              '/_next/data/BUILD_ID/post-1.json?name=post-1',
              '/_next/data/BUILD_ID/post-1.json?name=post-1&another=value',
              '/_next/data/BUILD_ID/post-1/comment-1.json?name=post-1&comment=comment-1',
              '/_next/data/BUILD_ID/post-1/comments.json?name=post-1',
            ]
          : [
              '/_next/data/BUILD_ID/p1/p2/all-ssg/hello.json?rest=hello',
              '/_next/data/BUILD_ID/p1/p2/all-ssg/hello1/hello2.json?rest=hello1&rest=hello2',
              '/_next/data/BUILD_ID/p1/p2/nested-all-ssg/hello.json?rest=hello',
              '/_next/data/BUILD_ID/p1/p2/nested-all-ssg/hello1/hello2.json?rest=hello1&rest=hello2',
            ]
      )

      // ensure no new cache entries after navigation
      const links = [
        {
          linkSelector: '#ssg-catch-all-single',
          waitForSelector: '#all-ssg-content',
        },
        {
          linkSelector: '#ssg-catch-all-single-interpolated',
          waitForSelector: '#all-ssg-content',
        },
        {
          linkSelector: '#ssg-catch-all-multi',
          waitForSelector: '#all-ssg-content',
        },
        {
          linkSelector: '#ssg-catch-all-multi-no-as',
          waitForSelector: '#all-ssg-content',
        },
        {
          linkSelector: '#ssg-catch-all-multi',
          waitForSelector: '#all-ssg-content',
        },
        {
          linkSelector: '#nested-ssg-catch-all-single',
          waitForSelector: '#nested-all-ssg-content',
        },
        {
          linkSelector: '#nested-ssg-catch-all-multi',
          waitForSelector: '#nested-all-ssg-content',
        },
      ]

      for (const { linkSelector, waitForSelector } of links) {
        await browser.elementByCss(linkSelector).click()
        await browser.waitForElementByCss(waitForSelector)
        await browser.back()
        await browser.waitForElementByCss(linkSelector)
      }
      const newCacheKeys = await getCacheKeys()
      expect(newCacheKeys).toEqual(
        [
          ...(process.env.__MIDDLEWARE_TEST
            ? // data route is fetched with middleware due to query hydration
              // since middleware matches the index route
              ['/_next/data/BUILD_ID/index.json']
            : []),
          ...cacheKeys,
        ].sort()
      )
    })
  }

  if (dev) {
    // TODO: pong event not longer exist, refactor test.
    it.skip('should not have error after pinging WebSocket', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.eval(`(function() {
        window.uncaughtErrs = []
        window.addEventListener('uncaughtexception', function (err) {
          window.uncaught.push(err)
        })
      })()`)
      const curFrames = [...(await browser.websocketFrames())]
      await check(async () => {
        const frames = await browser.websocketFrames()
        const newFrames = frames.slice(curFrames.length)
        // console.error({newFrames, curFrames, frames});

        return newFrames.some((frame) => {
          try {
            const data = JSON.parse(frame.payload)
            return data.event === 'pong'
          } catch (_) {}
          return false
        })
          ? 'success'
          : JSON.stringify(newFrames)
      }, 'success')
      expect(await browser.eval('window.uncaughtErrs.length')).toBe(0)
    })
  }

  it('should support long URLs for dynamic routes', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/dash/a9btBxtHQALZ6cxfuj18X6OLGNSkJVzrOXz41HG4QwciZfn7ggRZzPx21dWqGiTBAqFRiWvVNm5ko2lpyso5jtVaXg88dC1jKfqI2qmIcdeyJat8xamrIh2LWnrYRrsBcoKfQU65KHod8DPANuzPS3fkVYWlmov05GQbc82HwR1exOvPVKUKb5gBRWiN0WOh7hN4QyezIuq3dJINAptFQ6m2bNGjYACBRk4MOSHdcQG58oq5Ch7luuqrl9EcbWSa'
    )

    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('hi')
    expect(html).toContain('/dash/[hello-world]')
  })

  it('should handle only query on dynamic route', async () => {
    const browser = await webdriver(appPort, '/post-1')

    for (const expectedValues of [
      {
        id: 'dynamic-route-only-query',
        pathname: '/post-2',
        query: {},
        hash: '',
        navQuery: { name: 'post-2' },
      },
      {
        id: 'dynamic-route-only-query-extra',
        pathname: '/post-3',
        query: { another: 'value' },
        hash: '',
        navQuery: { name: 'post-3', another: 'value' },
      },
      {
        id: 'dynamic-route-only-query-obj',
        pathname: '/post-4',
        query: {},
        hash: '',
        navQuery: { name: 'post-4' },
      },
      {
        id: 'dynamic-route-only-query-obj-extra',
        pathname: '/post-5',
        query: { another: 'value' },
        hash: '',
        navQuery: { name: 'post-5', another: 'value' },
      },
      {
        id: 'dynamic-route-query-hash',
        pathname: '/post-2',
        query: {},
        hash: '#hash-too',
        navQuery: { name: 'post-2' },
      },
      {
        id: 'dynamic-route-query-extra-hash',
        pathname: '/post-3',
        query: { another: 'value' },
        hash: '#hash-again',
        navQuery: { name: 'post-3', another: 'value' },
      },
      {
        id: 'dynamic-route-query-hash-obj',
        pathname: '/post-4',
        query: {},
        hash: '#hash-too',
        navQuery: { name: 'post-4' },
      },
      {
        id: 'dynamic-route-query-obj-extra-hash',
        pathname: '/post-5',
        query: { another: 'value' },
        hash: '#hash-again',
        navQuery: { name: 'post-5', another: 'value' },
      },
    ]) {
      const { id, pathname, query, hash, navQuery } = expectedValues

      const parsedHref = url.parse(
        await browser.elementByCss(`#${id}`).getAttribute('href'),
        true
      )
      expect(parsedHref.pathname).toBe(pathname)
      expect(parsedHref.query || {}).toEqual(query)
      expect(parsedHref.hash || '').toBe(hash)

      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss(`#${id}`).click()
      await check(() => browser.eval('window.location.pathname'), pathname)

      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual(
        navQuery
      )
      expect(await browser.eval('window.location.pathname')).toBe(pathname)
      expect(await browser.eval('window.location.hash')).toBe(hash)
      expect(
        Object.fromEntries(
          new URLSearchParams(await browser.eval('window.location.search'))
        )
      ).toEqual(query)
      expect(await browser.eval('window.beforeNav')).toBe(1)
    }
  })

  it('should handle only hash on dynamic route', async () => {
    const browser = await webdriver(appPort, '/post-1')
    const parsedHref = url.parse(
      await browser
        .elementByCss('#dynamic-route-only-hash')
        .getAttribute('href'),
      true
    )
    expect(parsedHref.pathname).toBe('/post-1')
    expect(parsedHref.hash).toBe('#only-hash')
    expect(parsedHref.query || {}).toEqual({})

    const parsedHref2 = url.parse(
      await browser
        .elementByCss('#dynamic-route-only-hash-obj')
        .getAttribute('href'),
      true
    )
    expect(parsedHref2.pathname).toBe('/post-1')
    expect(parsedHref2.hash).toBe('#only-hash-obj')
    expect(parsedHref2.query || {}).toEqual({})

    expect(await browser.eval('window.location.hash')).toBe('')

    await browser.elementByCss('#dynamic-route-only-hash').click()
    expect(await browser.eval('window.location.hash')).toBe('#only-hash')

    await browser.elementByCss('#dynamic-route-only-hash-obj').click()
    expect(await browser.eval('window.location.hash')).toBe('#only-hash-obj')
  })

  it('should navigate with hash to dynamic route with link', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval('window.beforeNav = 1')

    await browser
      .elementByCss('#view-post-1-hash-1')
      .click()
      .waitForElementByCss('#asdf')

    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      name: 'post-1',
    })
    expect(await browser.eval('window.next.router.pathname')).toBe('/[name]')
    expect(await browser.eval('window.location.pathname')).toBe('/post-1')
    expect(await browser.eval('window.location.hash')).toBe('#my-hash')
    expect(await browser.eval('window.location.search')).toBe('')

    await browser
      .back()
      .waitForElementByCss('#view-post-1-hash-1-interpolated')
      .elementByCss('#view-post-1-hash-1-interpolated')
      .click('#view-post-1-hash-1-interpolated')
      .waitForElementByCss('#asdf')

    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      name: 'post-1',
    })
    expect(await browser.eval('window.next.router.pathname')).toBe('/[name]')
    expect(await browser.eval('window.location.pathname')).toBe('/post-1')
    expect(await browser.eval('window.location.hash')).toBe('#my-hash')
    expect(await browser.eval('window.location.search')).toBe('')

    await browser
      .back()
      .waitForElementByCss('#view-post-1-hash-1-href-only')
      .elementByCss('#view-post-1-hash-1-href-only')
      .click('#view-post-1-hash-1-href-only')
      .waitForElementByCss('#asdf')

    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      name: 'post-1',
    })
    expect(await browser.eval('window.next.router.pathname')).toBe('/[name]')
    expect(await browser.eval('window.location.pathname')).toBe('/post-1')
    expect(await browser.eval('window.location.hash')).toBe('#my-hash')
    expect(await browser.eval('window.location.search')).toBe('')
  })

  it('should navigate with hash to dynamic route with router', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push('/[name]', '/post-1#my-hash')
    })()`)

    await browser.waitForElementByCss('#asdf')

    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      name: 'post-1',
    })
    expect(await browser.eval('window.next.router.pathname')).toBe('/[name]')
    expect(await browser.eval('window.location.pathname')).toBe('/post-1')
    expect(await browser.eval('window.location.hash')).toBe('#my-hash')
    expect(await browser.eval('window.location.search')).toBe('')

    await browser.back().waitForElementByCss('#view-post-1-hash-1-interpolated')

    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push({
        hash: 'my-hash',
        pathname: '/[name]',
        query: {
          name: 'post-1'
        }
      })
    })()`)

    await browser.waitForElementByCss('#asdf')

    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      name: 'post-1',
    })
    expect(await browser.eval('window.next.router.pathname')).toBe('/[name]')
    expect(await browser.eval('window.location.pathname')).toBe('/post-1')
    expect(await browser.eval('window.location.hash')).toBe('#my-hash')
    expect(await browser.eval('window.location.search')).toBe('')

    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push('/post-1#my-hash')
    })()`)

    await browser.waitForElementByCss('#asdf')

    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      name: 'post-1',
    })
    expect(await browser.eval('window.next.router.pathname')).toBe('/[name]')
    expect(await browser.eval('window.location.pathname')).toBe('/post-1')
    expect(await browser.eval('window.location.hash')).toBe('#my-hash')
    expect(await browser.eval('window.location.search')).toBe('')
  })

  it('should not have any query values when not defined', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect(JSON.parse($('#query').text())).toEqual([])
  })

  it('should render normal route', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/my blog/i)
  })

  it('should render another normal route', async () => {
    const html = await renderViaHTTP(appPort, '/another')
    expect(html).toMatch(/hello from another/)
  })

  it('should render dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/post-1')
    expect(html).toMatch(/this is.*?post-1/i)
  })

  it('should prioritize a non-dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/post-1/comments')
    expect(html).toMatch(/show comments for.*post-1.*here/i)
  })

  it('should render nested dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/post-1/comment-1')
    expect(html).toMatch(/i am.*comment-1.*on.*post-1/i)
  })

  it('should render optional dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/543/comment')
    // expect(html).toMatch(/blog post.*543.*comment.*all/i)
    expect(html).toMatch(/404/i)
  })

  it('should render nested optional dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/321/comment/123')
    expect(html).toMatch(/blog post.*321.*comment.*123/i)
  })

  it('should not error when requesting dynamic page with /api', async () => {
    const res = await fetchViaHTTP(appPort, '/api')
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/this is.*?api/i)
  })

  it('should render dynamic route with query', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#view-post-1-with-query').click()
    await waitFor(1000)
    const url = await browser.eval('window.location.search')
    expect(url).toBe('?fromHome=true')
  })

  if (dev) {
    it('should not have any console warnings on initial load', async () => {
      const browser = await webdriver(appPort, '/')
      expect(await browser.eval('window.caughtWarns')).toEqual([])
    })

    it('should not have any console warnings when navigating to dynamic route', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        await browser.eval('window.beforeNav = 1')
        await browser.elementByCss('#dynamic-route-no-as').click()
        await browser.waitForElementByCss('#asdf')

        expect(await browser.eval('window.beforeNav')).toBe(1)

        const text = await browser.elementByCss('#asdf').text()
        expect(text).toMatch(/this is.*?dynamic-1/i)
        expect(await browser.eval('window.caughtWarns')).toEqual([])
      } finally {
        if (browser) await browser.close()
      }
    })
  }

  it('should navigate to a dynamic page successfully', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss('#view-post-1').click()
      await browser.waitForElementByCss('#asdf')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/this is.*?post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to a dynamic page with href with differing query and as correctly', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss('#view-post-1-hidden-query').click()
      await browser.waitForElementByCss('#asdf')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/this is.*?post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to a dynamic page successfully no as', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss('#view-post-1-no-as').click()
      await browser.waitForElementByCss('#asdf')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/this is.*?post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to a dynamic page successfully interpolated', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')

      const href = await browser
        .elementByCss('#view-post-1-interpolated')
        .getAttribute('href')

      const parsedHref = url.parse(href, true)
      expect(parsedHref.pathname).toBe('/post-1')
      expect(parsedHref.query).toEqual({})

      await browser.elementByCss('#view-post-1-interpolated').click()
      await browser.waitForElementByCss('#asdf')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/this is.*?post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to a dynamic page successfully interpolated with additional query values', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')

      const href = await browser
        .elementByCss('#view-post-1-interpolated-more-query')
        .getAttribute('href')

      const parsedHref = url.parse(href, true)
      expect(parsedHref.pathname).toBe('/post-1')
      expect(parsedHref.query).toEqual({ another: 'value' })

      await browser.elementByCss('#view-post-1-interpolated-more-query').click()
      await browser.waitForElementByCss('#asdf')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/this is.*?post-1/i)

      const query = JSON.parse(await browser.elementByCss('#query').text())
      expect(query).toEqual({
        name: 'post-1',
        another: 'value',
      })
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should allow calling Router.push on mount successfully', async () => {
    const browser = await webdriver(appPort, '/post-1/on-mount-redir')
    try {
      expect(await browser.waitForElementByCss('h3').text()).toBe('My blog')
    } finally {
      browser.close()
    }
  })

  it('should navigate optional dynamic page', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-post-1-comments').click()
      await browser.waitForElementByCss('#asdf')

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/comments for post-1 here/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate optional dynamic page with value', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-nested-dynamic-cmnt').click()
      await browser.waitForElementByCss('#asdf')

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/blog post.*321.*comment.*123/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to a nested dynamic page successfully', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss('#view-post-1-comment-1').click()
      await browser.waitForElementByCss('#asdf')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/i am.*comment-1.*on.*post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to a nested dynamic page successfully no as', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss('#view-post-1-comment-1-no-as').click()
      await browser.waitForElementByCss('#asdf')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/i am.*comment-1.*on.*post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to a nested dynamic page successfully interpolated', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')

      const href = await browser
        .elementByCss('#view-post-1-comment-1-interpolated')
        .getAttribute('href')

      expect(url.parse(href).pathname).toBe('/post-1/comment-1')

      await browser.elementByCss('#view-post-1-comment-1-interpolated').click()
      await browser.waitForElementByCss('#asdf')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#asdf').text()
      expect(text).toMatch(/i am.*comment-1.*on.*post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should pass params in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/post-1/cmnt-1')
    expect(html).toMatch(/gip.*post-1/i)
  })

  it('should pass params in getInitialProps during client navigation', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-post-1-comment-1').click()
      await browser.waitForElementByCss('span')

      const text = await browser.elementByCss('span').text()
      expect(text).toMatch(/gip.*post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[catch all] should not match root on SSR', async () => {
    const res = await fetchViaHTTP(appPort, '/p1/p2/all-ssr')
    expect(res.status).toBe(404)
  })

  it('[catch all] should pass param in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1"]}')
  })

  it('[catch all] should pass params in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1/test2')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1","test2"]}')
  })

  it('[catch all] should strip trailing slash', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1/test2/')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1","test2"]}')
  })

  it('[catch all] should not decode slashes (start)', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1/%2Ftest2')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1","/test2"]}')
  })

  it('[catch all] should not decode slashes (end)', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1%2F/test2')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1/","test2"]}')
  })

  it('[catch all] should not decode slashes (middle)', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1/te%2Fst2')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1","te/st2"]}')
  })

  it('[catch-all] should pass params in getInitialProps during client navigation (single)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#catch-all-single').click()
      await browser.waitForElementByCss('#all-ssr-content')

      const text = await browser.elementByCss('#all-ssr-content').text()
      expect(text).toBe('{"rest":["hello"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[catch-all] should pass params in getInitialProps during client navigation (multi)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#catch-all-multi').click()
      await browser.waitForElementByCss('#all-ssr-content')

      const text = await browser.elementByCss('#all-ssr-content').text()
      expect(text).toBe('{"rest":["hello1","hello2"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[catch-all] should pass params in getInitialProps during client navigation (encoded)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#catch-all-enc').click()
      await browser.waitForElementByCss('#all-ssr-content')

      const text = await browser.elementByCss('#all-ssr-content').text()
      expect(text).toBe('{"rest":["hello1/","he/llo2"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it("[catch-all] shouldn't fail on colon followed by double digits in the path", async () => {
    // https://github.com/GoogleChromeLabs/native-url/issues/27
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#catch-all-colonnumber').click()
      await browser.waitForElementByCss('#all-ssr-content')

      const text = await browser.elementByCss('#all-ssr-content').text()
      expect(text).toBe('{"rest":[":42"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[ssg: catch all] should pass param in getStaticProps during SSR', async () => {
    const data = await renderViaHTTP(
      appPort,
      `/_next/data/${buildId}/p1/p2/all-ssg/test1.json`
    )
    expect(JSON.parse(data).pageProps.params).toEqual({ rest: ['test1'] })
  })

  it('[ssg: catch all] should pass params in getStaticProps during SSR', async () => {
    const data = await renderViaHTTP(
      appPort,
      `/_next/data/${buildId}/p1/p2/all-ssg/test1/test2.json`
    )
    expect(JSON.parse(data).pageProps.params).toEqual({
      rest: ['test1', 'test2'],
    })
  })

  it('[nested ssg: catch all] should pass param in getStaticProps during SSR', async () => {
    const data = await renderViaHTTP(
      appPort,
      `/_next/data/${buildId}/p1/p2/nested-all-ssg/test1.json`
    )
    expect(JSON.parse(data).pageProps.params).toEqual({ rest: ['test1'] })
  })

  it('[nested ssg: catch all] should pass params in getStaticProps during SSR', async () => {
    const data = await renderViaHTTP(
      appPort,
      `/_next/data/${buildId}/p1/p2/nested-all-ssg/test1/test2.json`
    )
    expect(JSON.parse(data).pageProps.params).toEqual({
      rest: ['test1', 'test2'],
    })
  })

  it('[predefined ssg: catch all] should pass param in getStaticProps during SSR', async () => {
    const data = await renderViaHTTP(
      appPort,
      `/_next/data/${buildId}/p1/p2/predefined-ssg/test1.json`
    )
    expect(JSON.parse(data).pageProps.params).toEqual({ rest: ['test1'] })
  })

  it('[predefined ssg: catch all] should pass params in getStaticProps during SSR', async () => {
    const data = await renderViaHTTP(
      appPort,
      `/_next/data/${buildId}/p1/p2/predefined-ssg/test1/test2.json`
    )
    expect(JSON.parse(data).pageProps.params).toEqual({
      rest: ['test1', 'test2'],
    })
  })

  it('[predefined ssg: prerendered catch all] should pass param in getStaticProps during SSR', async () => {
    const data = await renderViaHTTP(
      appPort,
      `/_next/data/${buildId}/p1/p2/predefined-ssg/one-level.json`
    )
    expect(JSON.parse(data).pageProps.params).toEqual({ rest: ['one-level'] })
  })

  it('[predefined ssg: prerendered catch all] should pass params in getStaticProps during SSR', async () => {
    const data = await renderViaHTTP(
      appPort,
      `/_next/data/${buildId}/p1/p2/predefined-ssg/1st-level/2nd-level.json`
    )
    expect(JSON.parse(data).pageProps.params).toEqual({
      rest: ['1st-level', '2nd-level'],
    })
  })

  it('[ssg: catch-all] should pass params in getStaticProps during client navigation (single)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss('#ssg-catch-all-single').click()
      await browser.waitForElementByCss('#all-ssg-content')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#all-ssg-content').text()
      expect(text).toBe('{"rest":["hello"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[ssg: catch-all] should pass params in getStaticProps during client navigation (single interpolated)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')

      const href = await browser
        .elementByCss('#ssg-catch-all-single-interpolated')
        .getAttribute('href')

      expect(url.parse(href).pathname).toBe('/p1/p2/all-ssg/hello')

      await browser.elementByCss('#ssg-catch-all-single-interpolated').click()
      await browser.waitForElementByCss('#all-ssg-content')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#all-ssg-content').text()
      expect(text).toBe('{"rest":["hello"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[ssg: catch-all] should pass params in getStaticProps during client navigation (multi)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss('#ssg-catch-all-multi').click()
      await browser.waitForElementByCss('#all-ssg-content')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#all-ssg-content').text()
      expect(text).toBe('{"rest":["hello1","hello2"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[ssg: catch-all] should pass params in getStaticProps during client navigation (multi) no as', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss('#ssg-catch-all-multi-no-as').click()
      await browser.waitForElementByCss('#all-ssg-content')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#all-ssg-content').text()
      expect(text).toBe('{"rest":["hello1","hello2"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[ssg: catch-all] should pass params in getStaticProps during client navigation (multi interpolated)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = 1')

      const href = await browser
        .elementByCss('#ssg-catch-all-multi-interpolated')
        .getAttribute('href')

      expect(url.parse(href).pathname).toBe('/p1/p2/all-ssg/hello1/hello2')

      await browser.elementByCss('#ssg-catch-all-multi-interpolated').click()
      await browser.waitForElementByCss('#all-ssg-content')

      expect(await browser.eval('window.beforeNav')).toBe(1)

      const text = await browser.elementByCss('#all-ssg-content').text()
      expect(text).toBe('{"rest":["hello1","hello2"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[nested ssg: catch-all] should pass params in getStaticProps during client navigation (single)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#nested-ssg-catch-all-single').click()
      await browser.waitForElementByCss('#nested-all-ssg-content')

      const text = await browser.elementByCss('#nested-all-ssg-content').text()
      expect(text).toBe('{"rest":["hello"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[nested ssg: catch-all] should pass params in getStaticProps during client navigation (multi)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#nested-ssg-catch-all-multi').click()
      await browser.waitForElementByCss('#nested-all-ssg-content')

      const text = await browser.elementByCss('#nested-all-ssg-content').text()
      expect(text).toBe('{"rest":["hello1","hello2"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should update dynamic values on mount', async () => {
    const html = await renderViaHTTP(appPort, '/on-mount/post-1')
    expect(html).toMatch(/onmpost:.*pending/)

    const browser = await webdriver(appPort, '/on-mount/post-1')
    await check(
      () => browser.eval(`document.body.innerHTML`),
      /onmpost:.*post-1/
    )
  })

  it('should not have placeholder query values for SSS', async () => {
    const html = await renderViaHTTP(appPort, '/on-mount/post-1')
    expect(html).not.toMatch(/post:.*?\[post\].*?<\/p>/)
  })

  it('should update with a hash in the URL', async () => {
    const browser = await webdriver(appPort, '/on-mount/post-1#abc')
    await check(
      () => browser.eval(`document.body.innerHTML`),
      /onmpost:.*post-1/
    )
  })

  it('should scroll to a hash on mount', async () => {
    const browser = await webdriver(appPort, '/on-mount/post-1#item-400')

    await check(
      () => browser.eval(`document.body.innerHTML`),
      /onmpost:.*post-1/
    )

    const elementPosition = await browser.eval(
      `document.querySelector("#item-400").getBoundingClientRect().y`
    )
    expect(elementPosition).toEqual(0)
  })

  it('should scroll to a hash on client-side navigation', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#view-dynamic-with-hash').click()
    await browser.waitForElementByCss('#asdf')

    const text = await browser.elementByCss('#asdf').text()
    expect(text).toMatch(/onmpost:.*test-w-hash/)

    const elementPosition = await browser.eval(
      `document.querySelector("#item-400").getBoundingClientRect().y`
    )
    expect(elementPosition).toEqual(0)
  })

  it('should prioritize public files over dynamic route', async () => {
    const data = await renderViaHTTP(appPort, '/hello.txt')
    expect(data).toMatch(/hello world/)
  })

  it('should serve file with space from public folder', async () => {
    const res = await fetchViaHTTP(appPort, '/hello copy.txt')
    const text = (await res.text()).trim()
    expect(text).toBe('hello world copy')
    expect(res.status).toBe(200)
  })

  it('should serve file with plus from public folder', async () => {
    const res = await fetchViaHTTP(appPort, '/hello+copy.txt')
    const text = (await res.text()).trim()
    expect(text).toBe('hello world +')
    expect(res.status).toBe(200)
  })

  it('should serve file from public folder encoded', async () => {
    const res = await fetchViaHTTP(appPort, '/hello%20copy.txt')
    const text = (await res.text()).trim()
    expect(text).toBe('hello world copy')
    expect(res.status).toBe(200)
  })

  it('should serve file with %20 from public folder', async () => {
    const res = await fetchViaHTTP(appPort, '/hello%2520copy.txt')
    const text = (await res.text()).trim()
    expect(text).toBe('hello world %20')
    expect(res.status).toBe(200)
  })

  it('should serve file with space from static folder', async () => {
    const res = await fetchViaHTTP(appPort, '/static/hello copy.txt')
    const text = (await res.text()).trim()
    expect(text).toBe('hello world copy')
    expect(res.status).toBe(200)
  })

  it('should serve file with plus from static folder', async () => {
    const res = await fetchViaHTTP(appPort, '/static/hello+copy.txt')
    const text = (await res.text()).trim()
    expect(text).toBe('hello world +')
    expect(res.status).toBe(200)
  })

  it('should serve file from static folder encoded', async () => {
    const res = await fetchViaHTTP(appPort, '/static/hello%20copy.txt')
    const text = (await res.text()).trim()
    expect(text).toBe('hello world copy')
    expect(res.status).toBe(200)
  })

  it('should serve file with %20 from static folder', async () => {
    const res = await fetchViaHTTP(appPort, '/static/hello%2520copy.txt')
    const text = (await res.text()).trim()
    expect(text).toBe('hello world %20')
    expect(res.status).toBe(200)
  })

  it('should respond with bad request with invalid encoding', async () => {
    const res = await fetchViaHTTP(appPort, '/%')
    expect(res.status).toBe(400)
  })

  it('should not preload buildManifest for non-auto export dynamic pages', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    const $ = cheerio.load(html)
    let found = 0

    for (const el of Array.from($('link[rel="preload"]'))) {
      const { href } = el.attribs
      if (href.includes('_buildManifest')) {
        found++
      }
    }

    try {
      expect(found).toBe(0)
    } catch (err) {
      require('console').error(html)
      throw err
    }
  })

  if (dev) {
    it('should resolve dynamic route href for page added later', async () => {
      const browser = await webdriver(appPort, '/')
      const addLaterPage = join(appDir, 'pages/added-later/[slug].js')

      await fs.mkdir(dirname(addLaterPage)).catch(() => {})
      await fs.writeFile(
        addLaterPage,
        `
        import { useRouter } from 'next/router'

        export default function Page() {
          return <p id='added-later'>slug: {useRouter().query.slug}</p>
        }
      `
      )
      await check(async () => {
        const response = await fetchViaHTTP(
          appPort,
          '/_next/static/development/_devPagesManifest.json',
          undefined,
          {
            credentials: 'same-origin',
          }
        )

        // Check if the response was successful (status code in the range 200-299)
        if (!response.ok) {
          return 'fail'
        }

        const contents = await response.text()
        const containsAddedLater = contents.includes('added-later')

        return containsAddedLater ? 'success' : 'fail'
      }, 'success')

      await check(async () => {
        const contents = await renderViaHTTP(
          appPort,
          '/_next/static/development/_devPagesManifest.json'
        )
        return contents.includes('added-later') ? 'success' : 'fail'
      }, 'success')

      await browser.elementByCss('#added-later-link').click()
      await browser.waitForElementByCss('#added-later')

      const text = await browser.elementByCss('#added-later').text()

      await fs.remove(dirname(addLaterPage))
      expect(text).toBe('slug: first')
    })

    if (!process.env.__MIDDLEWARE_TEST) {
      it('should show error when interpolating fails for href', async () => {
        const browser = await webdriver(appPort, '/')
        await browser
          .elementByCss('#view-post-1-interpolated-incorrectly')
          .click()
        await assertHasRedbox(browser)
        const header = await getRedboxHeader(browser)
        expect(header).toContain(
          'The provided `href` (/[name]?another=value) value is missing query values (name) to be interpolated properly.'
        )
      })
    }

    it('should work with HMR correctly', async () => {
      const browser = await webdriver(appPort, '/post-1/comments')
      let text = await browser.eval(`document.documentElement.innerHTML`)
      expect(text).toMatch(/comments for.*post-1/)

      const page = join(appDir, 'pages/[name]/comments.js')
      const origContent = await fs.readFile(page, 'utf8')
      const newContent = origContent.replace(/comments/, 'commentss')

      try {
        await fs.writeFile(page, newContent, 'utf8')
        await waitFor(3 * 1000)

        let text = await browser.eval(`document.documentElement.innerHTML`)
        expect(text).toMatch(/commentss for.*post-1/)
      } finally {
        await fs.writeFile(page, origContent, 'utf8')
        if (browser) await browser.close()
      }
    })
  } else {
    it('should output a routes-manifest correctly', async () => {
      const manifest = await fs.readJson(
        join(appDir, '.next/routes-manifest.json')
      )

      for (const route of manifest.dynamicRoutes) {
        route.regex = normalizeRegEx(route.regex)

        // ensure regexes are valid
        new RegExp(route.regex)
        new RegExp(route.namedRegex)
      }

      for (const route of manifest.dataRoutes) {
        route.dataRouteRegex = normalizeRegEx(route.dataRouteRegex)

        // ensure regexes are valid
        new RegExp(route.dataRouteRegex)
        new RegExp(route.namedDataRouteRegex)
      }

      // Parse the manifest string back into an object.
      expect(normalizeManifest(manifest, [[buildId, 'BUILD_ID']]))
        .toMatchInlineSnapshot(`
       {
         "basePath": "",
         "caseSensitive": false,
         "dataRoutes": [
           {
             "dataRouteRegex": "^\\/_next\\/data\\/BUILD_ID\\/b\\/([^\\/]+?)\\.json$",
             "namedDataRouteRegex": "^/_next/data/BUILD_ID/b/(?<nxtP123>[^/]+?)\\.json$",
             "page": "/b/[123]",
             "routeKeys": {
               "nxtP123": "nxtP123",
             },
           },
           {
             "dataRouteRegex": "^\\/_next\\/data\\/BUILD_ID\\/c\\/([^\\/]+?)\\.json$",
             "namedDataRouteRegex": "^/_next/data/BUILD_ID/c/(?<a>[^/]+?)\\.json$",
             "page": "/c/[alongparamnameshouldbeallowedeventhoughweird]",
             "routeKeys": {
               "a": "nxtPalongparamnameshouldbeallowedeventhoughweird",
             },
           },
           {
             "dataRouteRegex": "^\\/_next\\/data\\/BUILD_ID\\/p1\\/p2\\/all\\-ssg\\/(.+?)\\.json$",
             "namedDataRouteRegex": "^/_next/data/BUILD_ID/p1/p2/all\\-ssg/(?<nxtPrest>.+?)\\.json$",
             "page": "/p1/p2/all-ssg/[...rest]",
             "routeKeys": {
               "nxtPrest": "nxtPrest",
             },
           },
           {
             "dataRouteRegex": "^\\/_next\\/data\\/BUILD_ID\\/p1\\/p2\\/nested\\-all\\-ssg\\/(.+?)\\.json$",
             "namedDataRouteRegex": "^/_next/data/BUILD_ID/p1/p2/nested\\-all\\-ssg/(?<nxtPrest>.+?)\\.json$",
             "page": "/p1/p2/nested-all-ssg/[...rest]",
             "routeKeys": {
               "nxtPrest": "nxtPrest",
             },
           },
           {
             "dataRouteRegex": "^\\/_next\\/data\\/BUILD_ID\\/p1\\/p2\\/predefined\\-ssg\\/(.+?)\\.json$",
             "namedDataRouteRegex": "^/_next/data/BUILD_ID/p1/p2/predefined\\-ssg/(?<nxtPrest>.+?)\\.json$",
             "page": "/p1/p2/predefined-ssg/[...rest]",
             "routeKeys": {
               "nxtPrest": "nxtPrest",
             },
           },
           {
             "dataRouteRegex": "^\\/_next\\/data\\/BUILD_ID\\/([^\\/]+?)\\/([^\\/]+?)\\/(.+?)\\.json$",
             "namedDataRouteRegex": "^/_next/data/BUILD_ID/(?<nxtPname>[^/]+?)/(?<nxtPcomment>[^/]+?)/(?<nxtPrest>.+?)\\.json$",
             "page": "/[name]/[comment]/[...rest]",
             "routeKeys": {
               "nxtPcomment": "nxtPcomment",
               "nxtPname": "nxtPname",
               "nxtPrest": "nxtPrest",
             },
           },
         ],
         "dynamicRoutes": [
           {
             "namedRegex": "^/b/(?<nxtP123>[^/]+?)(?:/)?$",
             "page": "/b/[123]",
             "regex": "^\\/b\\/([^\\/]+?)(?:\\/)?$",
             "routeKeys": {
               "nxtP123": "nxtP123",
             },
           },
           {
             "namedRegex": "^/blog/(?<nxtPname>[^/]+?)/comment/(?<nxtPid>[^/]+?)(?:/)?$",
             "page": "/blog/[name]/comment/[id]",
             "regex": "^\\/blog\\/([^\\/]+?)\\/comment\\/([^\\/]+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPid": "nxtPid",
               "nxtPname": "nxtPname",
             },
           },
           {
             "namedRegex": "^/c/(?<a>[^/]+?)(?:/)?$",
             "page": "/c/[alongparamnameshouldbeallowedeventhoughweird]",
             "regex": "^\\/c\\/([^\\/]+?)(?:\\/)?$",
             "routeKeys": {
               "a": "nxtPalongparamnameshouldbeallowedeventhoughweird",
             },
           },
           {
             "namedRegex": "^/catchall\\-dash/(?<nxtPhelloworld>.+?)(?:/)?$",
             "page": "/catchall-dash/[...hello-world]",
             "regex": "^\\/catchall\\-dash\\/(.+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPhelloworld": "nxtPhello-world",
             },
           },
           {
             "namedRegex": "^/d/(?<nxtPid>[^/]+?)(?:/)?$",
             "page": "/d/[id]",
             "regex": "^\\/d\\/([^\\/]+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPid": "nxtPid",
             },
           },
           {
             "namedRegex": "^/dash/(?<nxtPhelloworld>[^/]+?)(?:/)?$",
             "page": "/dash/[hello-world]",
             "regex": "^\\/dash\\/([^\\/]+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPhelloworld": "nxtPhello-world",
             },
           },
           {
             "namedRegex": "^/index/(?<nxtPslug>.+?)(?:/)?$",
             "page": "/index/[...slug]",
             "regex": "^\\/index\\/(.+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPslug": "nxtPslug",
             },
           },
           {
             "namedRegex": "^/on\\-mount/(?<nxtPpost>[^/]+?)(?:/)?$",
             "page": "/on-mount/[post]",
             "regex": "^\\/on\\-mount\\/([^\\/]+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPpost": "nxtPpost",
             },
           },
           {
             "namedRegex": "^/p1/p2/all\\-ssg/(?<nxtPrest>.+?)(?:/)?$",
             "page": "/p1/p2/all-ssg/[...rest]",
             "regex": "^\\/p1\\/p2\\/all\\-ssg\\/(.+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPrest": "nxtPrest",
             },
           },
           {
             "namedRegex": "^/p1/p2/all\\-ssr/(?<nxtPrest>.+?)(?:/)?$",
             "page": "/p1/p2/all-ssr/[...rest]",
             "regex": "^\\/p1\\/p2\\/all\\-ssr\\/(.+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPrest": "nxtPrest",
             },
           },
           {
             "namedRegex": "^/p1/p2/nested\\-all\\-ssg/(?<nxtPrest>.+?)(?:/)?$",
             "page": "/p1/p2/nested-all-ssg/[...rest]",
             "regex": "^\\/p1\\/p2\\/nested\\-all\\-ssg\\/(.+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPrest": "nxtPrest",
             },
           },
           {
             "namedRegex": "^/p1/p2/predefined\\-ssg/(?<nxtPrest>.+?)(?:/)?$",
             "page": "/p1/p2/predefined-ssg/[...rest]",
             "regex": "^\\/p1\\/p2\\/predefined\\-ssg\\/(.+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPrest": "nxtPrest",
             },
           },
           {
             "namedRegex": "^/(?<nxtPname>[^/]+?)(?:/)?$",
             "page": "/[name]",
             "regex": "^\\/([^\\/]+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPname": "nxtPname",
             },
           },
           {
             "namedRegex": "^/(?<nxtPname>[^/]+?)/comments(?:/)?$",
             "page": "/[name]/comments",
             "regex": "^\\/([^\\/]+?)\\/comments(?:\\/)?$",
             "routeKeys": {
               "nxtPname": "nxtPname",
             },
           },
           {
             "namedRegex": "^/(?<nxtPname>[^/]+?)/on\\-mount\\-redir(?:/)?$",
             "page": "/[name]/on-mount-redir",
             "regex": "^\\/([^\\/]+?)\\/on\\-mount\\-redir(?:\\/)?$",
             "routeKeys": {
               "nxtPname": "nxtPname",
             },
           },
           {
             "namedRegex": "^/(?<nxtPname>[^/]+?)/(?<nxtPcomment>[^/]+?)(?:/)?$",
             "page": "/[name]/[comment]",
             "regex": "^\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPcomment": "nxtPcomment",
               "nxtPname": "nxtPname",
             },
           },
           {
             "namedRegex": "^/(?<nxtPname>[^/]+?)/(?<nxtPcomment>[^/]+?)/(?<nxtPrest>.+?)(?:/)?$",
             "page": "/[name]/[comment]/[...rest]",
             "regex": "^\\/([^\\/]+?)\\/([^\\/]+?)\\/(.+?)(?:\\/)?$",
             "routeKeys": {
               "nxtPcomment": "nxtPcomment",
               "nxtPname": "nxtPname",
               "nxtPrest": "nxtPrest",
             },
           },
         ],
         "headers": [],
         "pages404": true,
         "redirects": [
           {
             "destination": "/:path+",
             "internal": true,
             "priority": true,
             "regex": "^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$",
             "source": "/:path+/",
             "statusCode": 308,
           },
         ],
         "rewriteHeaders": {
           "pathHeader": "x-nextjs-rewritten-path",
           "queryHeader": "x-nextjs-rewritten-query",
         },
         "rewrites": {
           "afterFiles": [],
           "beforeFiles": [],
           "fallback": [],
         },
         "rsc": {
           "clientParamParsing": false,
           "contentTypeHeader": "text/x-component",
           "didPostponeHeader": "x-nextjs-postponed",
           "dynamicRSCPrerender": false,
           "header": "rsc",
           "prefetchHeader": "next-router-prefetch",
           "prefetchSegmentDirSuffix": ".segments",
           "prefetchSegmentHeader": "next-router-segment-prefetch",
           "prefetchSegmentSuffix": ".segment.rsc",
           "prefetchSuffix": ".prefetch.rsc",
           "suffix": ".rsc",
           "varyHeader": "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch",
         },
         "staticRoutes": [
           {
             "namedRegex": "^/(?:/)?$",
             "page": "/",
             "regex": "^/(?:/)?$",
             "routeKeys": {},
           },
           {
             "namedRegex": "^/another(?:/)?$",
             "page": "/another",
             "regex": "^/another(?:/)?$",
             "routeKeys": {},
           },
         ],
         "version": 3,
       }
      `)
    })

    it('should output a pages-manifest correctly', async () => {
      const manifest = await fs.readJson(
        join(appDir, '.next/server/pages-manifest.json')
      )

      if (process.env.IS_TURBOPACK_TEST) {
        expect(manifest).toMatchInlineSnapshot(`
         {
           "/": "pages/index.html",
           "/404": "pages/404.html",
           "/[name]": "pages/[name].js",
           "/[name]/[comment]": "pages/[name]/[comment].js",
           "/[name]/[comment]/[...rest]": "pages/[name]/[comment]/[...rest].js",
           "/[name]/comments": "pages/[name]/comments.js",
           "/[name]/on-mount-redir": "pages/[name]/on-mount-redir.html",
           "/_app": "pages/_app.js",
           "/_document": "pages/_document.js",
           "/_error": "pages/_error.js",
           "/another": "pages/another.html",
           "/b/[123]": "pages/b/[123].js",
           "/blog/[name]/comment/[id]": "pages/blog/[name]/comment/[id].js",
           "/c/[alongparamnameshouldbeallowedeventhoughweird]": "pages/c/[alongparamnameshouldbeallowedeventhoughweird].js",
           "/catchall-dash/[...hello-world]": "pages/catchall-dash/[...hello-world].html",
           "/d/[id]": "pages/d/[id].html",
           "/dash/[hello-world]": "pages/dash/[hello-world].html",
           "/index/[...slug]": "pages/index/index/[...slug].html",
           "/on-mount/[post]": "pages/on-mount/[post].html",
           "/p1/p2/all-ssg/[...rest]": "pages/p1/p2/all-ssg/[...rest].js",
           "/p1/p2/all-ssr/[...rest]": "pages/p1/p2/all-ssr/[...rest].js",
           "/p1/p2/nested-all-ssg/[...rest]": "pages/p1/p2/nested-all-ssg/[...rest].js",
           "/p1/p2/predefined-ssg/[...rest]": "pages/p1/p2/predefined-ssg/[...rest].js",
         }
        `)
      } else {
        expect(manifest).toMatchInlineSnapshot(`
         {
           "/": "pages/index.html",
           "/404": "pages/404.html",
           "/[name]": "pages/[name].js",
           "/[name]/[comment]": "pages/[name]/[comment].js",
           "/[name]/[comment]/[...rest]": "pages/[name]/[comment]/[...rest].js",
           "/[name]/comments": "pages/[name]/comments.js",
           "/[name]/on-mount-redir": "pages/[name]/on-mount-redir.html",
           "/_app": "pages/_app.js",
           "/_document": "pages/_document.js",
           "/_error": "pages/_error.js",
           "/another": "pages/another.html",
           "/b/[123]": "pages/b/[123].js",
           "/blog/[name]/comment/[id]": "pages/blog/[name]/comment/[id].js",
           "/c/[alongparamnameshouldbeallowedeventhoughweird]": "pages/c/[alongparamnameshouldbeallowedeventhoughweird].js",
           "/catchall-dash/[...hello-world]": "pages/catchall-dash/[...hello-world].html",
           "/d/[id]": "pages/d/[id].html",
           "/dash/[hello-world]": "pages/dash/[hello-world].html",
           "/index/[...slug]": "pages/index/[...slug].html",
           "/on-mount/[post]": "pages/on-mount/[post].html",
           "/p1/p2/all-ssg/[...rest]": "pages/p1/p2/all-ssg/[...rest].js",
           "/p1/p2/all-ssr/[...rest]": "pages/p1/p2/all-ssr/[...rest].js",
           "/p1/p2/nested-all-ssg/[...rest]": "pages/p1/p2/nested-all-ssg/[...rest].js",
           "/p1/p2/predefined-ssg/[...rest]": "pages/p1/p2/predefined-ssg/[...rest].js",
         }
        `)
      }
    })
  }
}

const nextConfig = join(appDir, 'next.config.js')

describe('Dynamic Routing', () => {
  if (process.env.__MIDDLEWARE_TEST) {
    const middlewarePath = join(__dirname, '../middleware.js')

    beforeAll(async () => {
      await fs.writeFile(
        middlewarePath,
        `
        import { NextResponse } from 'next/server'
        export default function middleware() {
          return NextResponse.next()
        }
      `
      )
    })
    afterAll(() => fs.remove(middlewarePath))
  }

  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        await fs.remove(nextConfig)

        appPort = await findPort()
        app = await launchApp(appDir, appPort)
        buildId = 'development'
      })
      afterAll(() => killApp(app))

      runTests({ dev: true })
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await fs.remove(nextConfig)

        await nextBuild(appDir)
        buildId = await fs.readFile(buildIdPath, 'utf8')

        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests({ dev: false })
    }
  )
})
