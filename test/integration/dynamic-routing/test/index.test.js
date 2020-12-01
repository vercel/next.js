/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join, dirname } from 'path'
import fs from 'fs-extra'
import url from 'url'
import {
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
  hasRedbox,
  getRedboxHeader,
} from 'next-test-utils'
import cheerio from 'cheerio'
import escapeRegex from 'escape-string-regexp'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
let buildId
const appDir = join(__dirname, '../')
const buildIdPath = join(appDir, '.next/BUILD_ID')

function runTests(dev) {
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
    const text = await browser.eval(`document.body.innerHTML`)
    expect(text).toMatch(/onmpost:.*post-1/)
  })

  it('should not have placeholder query values for SSS', async () => {
    const html = await renderViaHTTP(appPort, '/on-mount/post-1')
    expect(html).not.toMatch(/post:.*?\[post\].*?<\/p>/)
  })

  it('should update with a hash in the URL', async () => {
    const browser = await webdriver(appPort, '/on-mount/post-1#abc')
    const text = await browser.eval(`document.body.innerHTML`)
    expect(text).toMatch(/onmpost:.*post-1/)
  })

  it('should scroll to a hash on mount', async () => {
    const browser = await webdriver(appPort, '/on-mount/post-1#item-400')

    const text = await browser.eval(`document.body.innerHTML`)
    expect(text).toMatch(/onmpost:.*post-1/)

    const scrollPosition = await browser.eval('window.pageYOffset')
    expect(scrollPosition).toBe(7232)
  })

  it('should scroll to a hash on client-side navigation', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#view-dynamic-with-hash').click()
    await browser.waitForElementByCss('#asdf')

    const text = await browser.elementByCss('#asdf').text()
    expect(text).toMatch(/onmpost:.*test-w-hash/)

    const scrollPosition = await browser.eval('window.pageYOffset')
    expect(scrollPosition).toBe(7232)
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

  it('should preload buildManifest for auto-export dynamic pages', async () => {
    const html = await renderViaHTTP(appPort, '/on-mount/hello')
    const $ = cheerio.load(html)
    let found = 0

    for (const el of Array.from($('link[rel="preload"]'))) {
      const { href } = el.attribs
      if (href.includes('_buildManifest')) {
        found++
      }
    }
    expect(found).toBe(1)
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
    expect(found).toBe(0)
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

    it('should show error when interpolating fails for href', async () => {
      const browser = await webdriver(appPort, '/')
      await browser
        .elementByCss('#view-post-1-interpolated-incorrectly')
        .click()
      await hasRedbox(browser)
      const header = await getRedboxHeader(browser)
      expect(header).toContain(
        'The provided `href` (/[name]?another=value) value is missing query values (name) to be interpolated properly.'
      )
    })

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

      expect(manifest).toEqual({
        version: 3,
        pages404: true,
        basePath: '',
        headers: [],
        rewrites: [],
        redirects: expect.arrayContaining([]),
        dataRoutes: [
          {
            dataRouteRegex: `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/b\\/([^\\/]+?)\\.json$`,
            namedDataRouteRegex: `^/_next/data/${escapeRegex(
              buildId
            )}/b/(?<a>[^/]+?)\\.json$`,
            page: '/b/[123]',
            routeKeys: {
              a: '123',
            },
          },
          {
            dataRouteRegex: `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/c\\/([^\\/]+?)\\.json$`,
            namedDataRouteRegex: `^/_next/data/${escapeRegex(
              buildId
            )}/c/(?<a>[^/]+?)\\.json$`,
            page: '/c/[alongparamnameshouldbeallowedeventhoughweird]',
            routeKeys: {
              a: 'alongparamnameshouldbeallowedeventhoughweird',
            },
          },
          {
            namedDataRouteRegex: `^/_next/data/${escapeRegex(
              buildId
            )}/p1/p2/all\\-ssg/(?<rest>.+?)\\.json$`,
            dataRouteRegex: normalizeRegEx(
              `^\\/_next\\/data\\/${escapeRegex(
                buildId
              )}\\/p1\\/p2\\/all\\-ssg\\/(.+?)\\.json$`
            ),
            page: '/p1/p2/all-ssg/[...rest]',
            routeKeys: {
              rest: 'rest',
            },
          },
          {
            namedDataRouteRegex: `^/_next/data/${escapeRegex(
              buildId
            )}/p1/p2/nested\\-all\\-ssg/(?<rest>.+?)\\.json$`,
            dataRouteRegex: normalizeRegEx(
              `^\\/_next\\/data\\/${escapeRegex(
                buildId
              )}\\/p1\\/p2\\/nested\\-all\\-ssg\\/(.+?)\\.json$`
            ),
            page: '/p1/p2/nested-all-ssg/[...rest]',
            routeKeys: {
              rest: 'rest',
            },
          },
          {
            namedDataRouteRegex: `^/_next/data/${escapeRegex(
              buildId
            )}/p1/p2/predefined\\-ssg/(?<rest>.+?)\\.json$`,
            dataRouteRegex: normalizeRegEx(
              `^\\/_next\\/data\\/${escapeRegex(
                buildId
              )}\\/p1\\/p2\\/predefined\\-ssg\\/(.+?)\\.json$`
            ),
            page: '/p1/p2/predefined-ssg/[...rest]',
            routeKeys: {
              rest: 'rest',
            },
          },
        ],
        dynamicRoutes: [
          {
            namedRegex: '^/b/(?<a>[^/]+?)(?:/)?$',
            page: '/b/[123]',
            regex: normalizeRegEx('^\\/b\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              a: '123',
            },
          },
          {
            namedRegex: `^/blog/(?<name>[^/]+?)/comment/(?<id>[^/]+?)(?:/)?$`,
            page: '/blog/[name]/comment/[id]',
            regex: normalizeRegEx(
              '^\\/blog\\/([^\\/]+?)\\/comment\\/([^\\/]+?)(?:\\/)?$'
            ),
            routeKeys: {
              name: 'name',
              id: 'id',
            },
          },
          {
            namedRegex: '^/c/(?<a>[^/]+?)(?:/)?$',
            page: '/c/[alongparamnameshouldbeallowedeventhoughweird]',
            regex: normalizeRegEx('^\\/c\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              a: 'alongparamnameshouldbeallowedeventhoughweird',
            },
          },
          {
            namedRegex: '^/catchall\\-dash/(?<helloworld>.+?)(?:/)?$',
            page: '/catchall-dash/[...hello-world]',
            regex: normalizeRegEx('^\\/catchall\\-dash\\/(.+?)(?:\\/)?$'),
            routeKeys: {
              helloworld: 'hello-world',
            },
          },
          {
            namedRegex: '^/d/(?<id>[^/]+?)(?:/)?$',
            page: '/d/[id]',
            regex: normalizeRegEx('^\\/d\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              id: 'id',
            },
          },
          {
            namedRegex: '^/dash/(?<helloworld>[^/]+?)(?:/)?$',
            page: '/dash/[hello-world]',
            regex: normalizeRegEx('^\\/dash\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              helloworld: 'hello-world',
            },
          },
          {
            namedRegex: `^/on\\-mount/(?<post>[^/]+?)(?:/)?$`,
            page: '/on-mount/[post]',
            regex: normalizeRegEx('^\\/on\\-mount\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              post: 'post',
            },
          },
          {
            namedRegex: `^/p1/p2/all\\-ssg/(?<rest>.+?)(?:/)?$`,
            page: '/p1/p2/all-ssg/[...rest]',
            regex: normalizeRegEx('^\\/p1\\/p2\\/all\\-ssg\\/(.+?)(?:\\/)?$'),
            routeKeys: {
              rest: 'rest',
            },
          },
          {
            namedRegex: `^/p1/p2/all\\-ssr/(?<rest>.+?)(?:/)?$`,
            page: '/p1/p2/all-ssr/[...rest]',
            regex: normalizeRegEx('^\\/p1\\/p2\\/all\\-ssr\\/(.+?)(?:\\/)?$'),
            routeKeys: {
              rest: 'rest',
            },
          },
          {
            namedRegex: `^/p1/p2/nested\\-all\\-ssg/(?<rest>.+?)(?:/)?$`,
            page: '/p1/p2/nested-all-ssg/[...rest]',
            regex: normalizeRegEx(
              '^\\/p1\\/p2\\/nested\\-all\\-ssg\\/(.+?)(?:\\/)?$'
            ),
            routeKeys: {
              rest: 'rest',
            },
          },
          {
            namedRegex: `^/p1/p2/predefined\\-ssg/(?<rest>.+?)(?:/)?$`,
            page: '/p1/p2/predefined-ssg/[...rest]',
            regex: normalizeRegEx(
              '^\\/p1\\/p2\\/predefined\\-ssg\\/(.+?)(?:\\/)?$'
            ),
            routeKeys: {
              rest: 'rest',
            },
          },
          {
            namedRegex: `^/(?<name>[^/]+?)(?:/)?$`,
            page: '/[name]',
            regex: normalizeRegEx('^\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              name: 'name',
            },
          },
          {
            namedRegex: `^/(?<name>[^/]+?)/comments(?:/)?$`,
            page: '/[name]/comments',
            regex: normalizeRegEx('^\\/([^\\/]+?)\\/comments(?:\\/)?$'),
            routeKeys: {
              name: 'name',
            },
          },
          {
            namedRegex: `^/(?<name>[^/]+?)/on\\-mount\\-redir(?:/)?$`,
            page: '/[name]/on-mount-redir',
            regex: normalizeRegEx(
              '^\\/([^\\/]+?)\\/on\\-mount\\-redir(?:\\/)?$'
            ),
            routeKeys: {
              name: 'name',
            },
          },
          {
            namedRegex: `^/(?<name>[^/]+?)/(?<comment>[^/]+?)(?:/)?$`,
            page: '/[name]/[comment]',
            regex: normalizeRegEx('^\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$'),
            routeKeys: {
              name: 'name',
              comment: 'comment',
            },
          },
        ],
      })
    })
  }
}

const nextConfig = join(appDir, 'next.config.js')

describe('Dynamic Routing', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.remove(nextConfig)

      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      buildId = 'development'
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(nextConfig)

      await nextBuild(appDir)
      buildId = await fs.readFile(buildIdPath, 'utf8')

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`
      )

      await nextBuild(appDir)
      buildId = await fs.readFile(buildIdPath, 'utf8')

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })
    runTests()
  })
})
