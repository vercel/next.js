/* eslint-env jest */

import cheerio from 'cheerio'
import escapeRegex from 'escape-string-regexp'
import fs from 'fs-extra'
import {
  check,
  fetchViaHTTP,
  File,
  findPort,
  getBrowserBodyText,
  getRedboxHeader,
  hasRedbox,
  initNextServerScript,
  killApp,
  launchApp,
  nextBuild,
  nextExport,
  nextStart,
  normalizeRegEx,
  renderViaHTTP,
  startStaticServer,
  stopApp,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { dirname, join } from 'path'
import url from 'url'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
const indexPage = join(__dirname, '../pages/index.js')
let app
let appPort
let buildId
let distPagesDir
let exportDir
let stderr
let origConfig

const startServer = async (optEnv = {}) => {
  const scriptPath = join(appDir, 'server.js')
  const env = Object.assign(
    {},
    { ...process.env },
    { PORT: `${appPort}` },
    optEnv
  )

  return initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/
  )
}

const expectedManifestRoutes = () => ({
  '/': {
    dataRoute: `/_next/data/${buildId}/index.json`,
    initialRevalidateSeconds: 1,
    srcRoute: null,
  },
  '/blog/[post3]': {
    dataRoute: `/_next/data/${buildId}/blog/[post3].json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]',
  },
  '/blog/post-1': {
    dataRoute: `/_next/data/${buildId}/blog/post-1.json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]',
  },
  '/blog/post-2': {
    dataRoute: `/_next/data/${buildId}/blog/post-2.json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]',
  },
  '/blog/post-4': {
    dataRoute: `/_next/data/${buildId}/blog/post-4.json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]',
  },
  '/blog/post-1/comment-1': {
    dataRoute: `/_next/data/${buildId}/blog/post-1/comment-1.json`,
    initialRevalidateSeconds: 2,
    srcRoute: '/blog/[post]/[comment]',
  },
  '/blog/post-2/comment-2': {
    dataRoute: `/_next/data/${buildId}/blog/post-2/comment-2.json`,
    initialRevalidateSeconds: 2,
    srcRoute: '/blog/[post]/[comment]',
  },
  '/blog/post.1': {
    dataRoute: `/_next/data/${buildId}/blog/post.1.json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]',
  },
  '/catchall-explicit/another/value': {
    dataRoute: `/_next/data/${buildId}/catchall-explicit/another/value.json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall-explicit/[...slug]',
  },
  '/catchall-explicit/first': {
    dataRoute: `/_next/data/${buildId}/catchall-explicit/first.json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall-explicit/[...slug]',
  },
  '/catchall-explicit/hello/another': {
    dataRoute: `/_next/data/${buildId}/catchall-explicit/hello/another.json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall-explicit/[...slug]',
  },
  '/catchall-explicit/second': {
    dataRoute: `/_next/data/${buildId}/catchall-explicit/second.json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall-explicit/[...slug]',
  },
  '/catchall-explicit/[first]/[second]': {
    dataRoute: `/_next/data/${buildId}/catchall-explicit/[first]/[second].json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall-explicit/[...slug]',
  },
  '/catchall-explicit/[third]/[fourth]': {
    dataRoute: `/_next/data/${buildId}/catchall-explicit/[third]/[fourth].json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall-explicit/[...slug]',
  },
  '/catchall-optional': {
    dataRoute: `/_next/data/${buildId}/catchall-optional.json`,
    initialRevalidateSeconds: false,
    srcRoute: '/catchall-optional/[[...slug]]',
  },
  '/catchall-optional/value': {
    dataRoute: `/_next/data/${buildId}/catchall-optional/value.json`,
    initialRevalidateSeconds: false,
    srcRoute: '/catchall-optional/[[...slug]]',
  },
  '/another': {
    dataRoute: `/_next/data/${buildId}/another.json`,
    initialRevalidateSeconds: 1,
    srcRoute: null,
  },
  '/blog': {
    dataRoute: `/_next/data/${buildId}/blog.json`,
    initialRevalidateSeconds: 10,
    srcRoute: null,
  },
  '/default-revalidate': {
    dataRoute: `/_next/data/${buildId}/default-revalidate.json`,
    initialRevalidateSeconds: false,
    srcRoute: null,
  },
  '/dynamic/[first]': {
    dataRoute: `/_next/data/${buildId}/dynamic/[first].json`,
    initialRevalidateSeconds: false,
    srcRoute: '/dynamic/[slug]',
  },
  '/dynamic/[second]': {
    dataRoute: `/_next/data/${buildId}/dynamic/[second].json`,
    initialRevalidateSeconds: false,
    srcRoute: '/dynamic/[slug]',
  },
  '/index': {
    dataRoute: `/_next/data/${buildId}/index/index.json`,
    initialRevalidateSeconds: false,
    srcRoute: null,
  },
  '/lang/de/about': {
    dataRoute: `/_next/data/${buildId}/lang/de/about.json`,
    initialRevalidateSeconds: false,
    srcRoute: '/lang/[lang]/about',
  },
  '/lang/en/about': {
    dataRoute: `/_next/data/${buildId}/lang/en/about.json`,
    initialRevalidateSeconds: false,
    srcRoute: '/lang/[lang]/about',
  },
  '/lang/es/about': {
    dataRoute: `/_next/data/${buildId}/lang/es/about.json`,
    initialRevalidateSeconds: false,
    srcRoute: '/lang/[lang]/about',
  },
  '/lang/fr/about': {
    dataRoute: `/_next/data/${buildId}/lang/fr/about.json`,
    initialRevalidateSeconds: false,
    srcRoute: '/lang/[lang]/about',
  },
  '/something': {
    dataRoute: `/_next/data/${buildId}/something.json`,
    initialRevalidateSeconds: false,
    srcRoute: null,
  },
  '/catchall/another/value': {
    dataRoute: `/_next/data/${buildId}/catchall/another/value.json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall/[...slug]',
  },
  '/catchall/first': {
    dataRoute: `/_next/data/${buildId}/catchall/first.json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall/[...slug]',
  },
  '/catchall/second': {
    dataRoute: `/_next/data/${buildId}/catchall/second.json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall/[...slug]',
  },
  '/catchall/hello/another': {
    dataRoute: `/_next/data/${buildId}/catchall/hello/another.json`,
    initialRevalidateSeconds: 1,
    srcRoute: '/catchall/[...slug]',
  },
})

const navigateTest = (dev = false) => {
  it('should navigate between pages successfully', async () => {
    const toBuild = [
      '/',
      '/another',
      '/something',
      '/normal',
      '/blog/post-1',
      '/blog/post-1/comment-1',
      '/catchall/first',
    ]

    await waitFor(2500)

    await Promise.all(toBuild.map((pg) => renderViaHTTP(appPort, pg)))

    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /another
    async function goFromHomeToAnother() {
      await browser.eval('window.beforeAnother = true')
      await browser.elementByCss('#another').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('p').text()
      expect(await browser.eval('window.beforeAnother')).toBe(true)
      expect(text).toMatch(/hello.*?world/)
    }
    await goFromHomeToAnother()

    // go to /
    async function goFromAnotherToHome() {
      await browser.eval('window.didTransition = 1')
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#another')
      text = await browser.elementByCss('p').text()
      expect(text).toMatch(/hello.*?world/)
      expect(await browser.eval('window.didTransition')).toBe(1)
    }
    await goFromAnotherToHome()

    // Client-side SSG data caching test
    // eslint-disable-next-line no-lone-blocks
    {
      // Let revalidation period lapse
      await waitFor(2000)

      // Trigger revalidation (visit page)
      await goFromHomeToAnother()
      const snapTime = await browser.elementByCss('#anotherTime').text()

      // Wait for revalidation to finish
      await waitFor(2000)

      // Re-visit page
      await goFromAnotherToHome()
      await goFromHomeToAnother()

      const nextTime = await browser.elementByCss('#anotherTime').text()
      if (dev) {
        expect(snapTime).not.toMatch(nextTime)
      } else {
        expect(snapTime).toMatch(nextTime)
      }

      // Reset to Home for next test
      await goFromAnotherToHome()
    }

    // go to /something
    await browser.elementByCss('#something').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#post-1')

    // go to /blog/post-1
    await browser.elementByCss('#post-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Post:.*?post-1/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /index
    await browser.elementByCss('#to-nested-index').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello nested index/)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /catchall-optional
    await browser.elementByCss('#catchall-optional-root').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Catch all: \[\]/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /dynamic/[first]
    await browser.elementByCss('#dynamic-first').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('#param').text()
    expect(text).toMatch(/Hi \[first\]!/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /dynamic/[second]
    await browser.elementByCss('#dynamic-second').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('#param').text()
    expect(text).toMatch(/Hi \[second\]!/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /catchall-explicit/[first]/[second]
    await browser.elementByCss('#catchall-explicit-string').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('#catchall').text()
    expect(text).toMatch(/Hi \[first\] \[second\]/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /catchall-explicit/[first]/[second]
    await browser.elementByCss('#catchall-explicit-object').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('#catchall').text()
    expect(text).toMatch(/Hi \[third\] \[fourth\]/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /catchall-optional/value
    await browser.elementByCss('#catchall-optional-value').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Catch all: \[value\]/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /blog/post-1/comment-1
    await browser.elementByCss('#comment-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p:nth-child(2)').text()
    expect(text).toMatch(/Comment:.*?comment-1/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /catchall/first
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#to-catchall')
    await browser.elementByCss('#to-catchall').click()
    await browser.waitForElementByCss('#catchall')
    text = await browser.elementByCss('#catchall').text()
    expect(text).toMatch(/Hi.*?first/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    await browser.close()
  })
}

const runTests = (dev = false, isEmulatedServerless = false) => {
  navigateTest(dev)

  it('should SSR normal page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/hello.*?world/)
  })

  it('should SSR incremental page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1')

    const $ = cheerio.load(html)
    expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(false)
    expect(html).toMatch(/Post:.*?post-1/)
  })

  it('should have gsp in __NEXT_DATA__', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect(JSON.parse($('#__NEXT_DATA__').text()).gsp).toBe(true)
  })

  it('should not have gsp in __NEXT_DATA__ for non-GSP page', async () => {
    const html = await renderViaHTTP(appPort, '/normal')
    const $ = cheerio.load(html)
    expect('gsp' in JSON.parse($('#__NEXT_DATA__').text())).toBe(false)
  })

  it('should not supply query values to params or useRouter non-dynamic page SSR', async () => {
    const html = await renderViaHTTP(appPort, '/something?hello=world')
    const $ = cheerio.load(html)
    const query = $('#query').text()
    expect(JSON.parse(query)).toEqual({})
    const params = $('#params').text()
    expect(JSON.parse(params)).toEqual({})
  })

  it('should not supply query values to params in /_next/data request', async () => {
    const data = JSON.parse(
      await renderViaHTTP(
        appPort,
        `/_next/data/${buildId}/something.json?hello=world`
      )
    )
    expect(data.pageProps.params).toEqual({})
  })

  it('should not supply query values to params or useRouter dynamic page SSR', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1?hello=world')
    const $ = cheerio.load(html)

    const params = $('#params').text()
    expect(JSON.parse(params)).toEqual({ post: 'post-1' })

    const query = $('#query').text()
    expect(JSON.parse(query)).toEqual({ post: 'post-1' })
  })

  it('should return data correctly', async () => {
    const data = JSON.parse(
      await renderViaHTTP(
        appPort,
        expectedManifestRoutes()['/something'].dataRoute
      )
    )
    expect(data.pageProps.world).toBe('world')
  })

  it('should return data correctly for dynamic page', async () => {
    const data = JSON.parse(
      await renderViaHTTP(
        appPort,
        expectedManifestRoutes()['/blog/post-1'].dataRoute
      )
    )
    expect(data.pageProps.post).toBe('post-1')
  })

  it('should return data correctly for dynamic page (non-seeded)', async () => {
    const data = JSON.parse(
      await renderViaHTTP(
        appPort,
        expectedManifestRoutes()['/blog/post-1'].dataRoute.replace(
          /post-1/,
          'post-3'
        )
      )
    )
    expect(data.pageProps.post).toBe('post-3')
  })

  it('should navigate to a normal page and back', async () => {
    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    await browser.elementByCss('#normal').click()
    await browser.waitForElementByCss('#normal-text')
    text = await browser.elementByCss('#normal-text').text()
    expect(text).toMatch(/a normal page/)
  })

  it('should parse query values on mount correctly', async () => {
    const browser = await webdriver(appPort, '/blog/post-1?another=value')
    const text = await browser.elementByCss('#query').text()
    expect(text).toMatch(/another.*?value/)
    expect(text).toMatch(/post.*?post-1/)
  })

  it('should reload page on failed data request', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval('window.beforeClick = "abc"')
    await browser.elementByCss('#broken-post').click()
    expect(
      await check(() => browser.eval('window.beforeClick'), {
        test(v) {
          return v !== 'abc'
        },
      })
    ).toBe(true)
  })

  it('should SSR dynamic page with brackets in param as object', async () => {
    const html = await renderViaHTTP(appPort, '/dynamic/[first]')
    const $ = cheerio.load(html)
    expect($('#param').text()).toMatch(/Hi \[first\]!/)
  })

  it('should navigate to dynamic page with brackets in param as object', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#dynamic-first').click()
    await browser.waitForElementByCss('#param')
    const value = await browser.elementByCss('#param').text()
    expect(value).toMatch(/Hi \[first\]!/)
  })

  it('should SSR dynamic page with brackets in param as string', async () => {
    const html = await renderViaHTTP(appPort, '/dynamic/[second]')
    const $ = cheerio.load(html)
    expect($('#param').text()).toMatch(/Hi \[second\]!/)
  })

  it('should navigate to dynamic page with brackets in param as string', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#dynamic-second').click()
    await browser.waitForElementByCss('#param')
    const value = await browser.elementByCss('#param').text()
    expect(value).toMatch(/Hi \[second\]!/)
  })

  it('should SSR catch-all page with brackets in param as string', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/catchall-explicit/[first]/[second]'
    )
    const $ = cheerio.load(html)
    expect($('#catchall').text()).toMatch(/Hi \[first\] \[second\]/)
  })

  it('should navigate to catch-all page with brackets in param as string', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#catchall-explicit-string').click()
    await browser.waitForElementByCss('#catchall')
    const value = await browser.elementByCss('#catchall').text()
    expect(value).toMatch(/Hi \[first\] \[second\]/)
  })

  it('should SSR catch-all page with brackets in param as object', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/catchall-explicit/[third]/[fourth]'
    )
    const $ = cheerio.load(html)
    expect($('#catchall').text()).toMatch(/Hi \[third\] \[fourth\]/)
  })

  it('should navigate to catch-all page with brackets in param as object', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#catchall-explicit-object').click()
    await browser.waitForElementByCss('#catchall')
    const value = await browser.elementByCss('#catchall').text()
    expect(value).toMatch(/Hi \[third\] \[fourth\]/)
  })

  // TODO: dev currently renders this page as blocking, meaning it shows the
  // server error instead of continuously retrying. Do we want to change this?
  if (!dev) {
    it('should reload page on failed data request, and retry', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeClick = "abc"')
      await browser.elementByCss('#broken-at-first-post').click()
      expect(
        await check(() => browser.eval('window.beforeClick'), {
          test(v) {
            return v !== 'abc'
          },
        })
      ).toBe(true)

      const text = await browser.elementByCss('#params').text()
      expect(text).toMatch(/post.*?post-999/)
    })
  }

  it('should support prerendered catchall route', async () => {
    const html = await renderViaHTTP(appPort, '/catchall/another/value')
    const $ = cheerio.load(html)

    expect(
      JSON.parse(cheerio.load(html)('#__NEXT_DATA__').text()).isFallback
    ).toBe(false)
    expect($('#catchall').text()).toMatch(/Hi.*?another value/)
  })

  it('should support lazy catchall route', async () => {
    const html = await renderViaHTTP(appPort, '/catchall/notreturnedinpaths')
    const $ = cheerio.load(html)
    expect($('#catchall').text()).toBe('fallback')

    // hydration
    const browser = await webdriver(appPort, '/catchall/delayby3s')

    const text1 = await browser.elementByCss('#catchall').text()
    expect(text1).toBe('fallback')

    await check(
      () => browser.elementByCss('#catchall').text(),
      /Hi.*?delayby3s/
    )
  })

  it('should support nested lazy catchall route', async () => {
    // We will render fallback for a "lazy" route
    const html = await renderViaHTTP(
      appPort,
      '/catchall/notreturnedinpaths/nested'
    )
    const $ = cheerio.load(html)
    expect($('#catchall').text()).toBe('fallback')

    // hydration
    const browser = await webdriver(appPort, '/catchall/delayby3s/nested')

    const text1 = await browser.elementByCss('#catchall').text()
    expect(text1).toBe('fallback')

    await check(
      () => browser.elementByCss('#catchall').text(),
      /Hi.*?delayby3s nested/
    )
  })

  it('should support prerendered catchall-explicit route (nested)', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/catchall-explicit/another/value'
    )
    const $ = cheerio.load(html)

    expect(
      JSON.parse(cheerio.load(html)('#__NEXT_DATA__').text()).isFallback
    ).toBe(false)
    expect($('#catchall').text()).toMatch(/Hi.*?another value/)
  })

  it('should support prerendered catchall-explicit route (single)', async () => {
    const html = await renderViaHTTP(appPort, '/catchall-explicit/second')
    const $ = cheerio.load(html)

    expect(
      JSON.parse(cheerio.load(html)('#__NEXT_DATA__').text()).isFallback
    ).toBe(false)
    expect($('#catchall').text()).toMatch(/Hi.*?second/)
  })

  if (!isEmulatedServerless) {
    it('should handle fallback only page correctly HTML', async () => {
      const browser = await webdriver(appPort, '/fallback-only/first%2Fpost')

      const text = await browser.elementByCss('p').text()
      expect(text).toContain('hi fallback')

      // wait for fallback data to load
      await check(() => browser.elementByCss('p').text(), /Post/)

      // check fallback data
      const post = await browser.elementByCss('p').text()
      const query = JSON.parse(await browser.elementByCss('#query').text())
      const params = JSON.parse(await browser.elementByCss('#params').text())

      expect(post).toContain('first/post')
      expect(params).toEqual({
        slug: 'first/post',
      })
      expect(query).toEqual(params)
    })

    it('should handle fallback only page correctly data', async () => {
      const data = JSON.parse(
        await renderViaHTTP(
          appPort,
          `/_next/data/${buildId}/fallback-only/second%2Fpost.json`
        )
      )

      expect(data.pageProps.params).toEqual({
        slug: 'second/post',
      })
    })
  }

  if (!isEmulatedServerless) {
    it('should 404 for a missing catchall explicit route', async () => {
      const res = await fetchViaHTTP(
        appPort,
        '/catchall-explicit/notreturnedinpaths'
      )
      expect(res.status).toBe(404)
      const html = await res.text()
      expect(html).toMatch(/This page could not be found/)
    })

    it('should allow rewriting to SSG page with fallback: false', async () => {
      const html = await renderViaHTTP(appPort, '/about')
      expect(html).toMatch(/About:.*?en/)
    })

    it('should fetch /_next/data correctly with mismatched href and as', async () => {
      const browser = await webdriver(appPort, '/')

      if (!dev) {
        await browser.eval(() =>
          document.querySelector('#to-rewritten-ssg').scrollIntoView()
        )

        await check(
          async () => {
            const links = await browser.elementsByCss('link[rel=prefetch]')
            let found = false

            for (const link of links) {
              const href = await link.getAttribute('href')
              const { pathname } = url.parse(href)

              if (pathname.endsWith('/lang/en/about.json')) {
                found = true
                break
              }
            }
            return found
          },
          {
            test(result) {
              return result === true
            },
          }
        )
      }
      await browser.eval('window.beforeNav = "hi"')
      await browser.elementByCss('#to-rewritten-ssg').click()
      await browser.waitForElementByCss('#about')

      expect(await browser.eval('window.beforeNav')).toBe('hi')
      expect(await browser.elementByCss('#about').text()).toBe('About: en')
    })
  }

  if (dev) {
    it('should show error when rewriting to dynamic SSG page', async () => {
      const item = Math.round(Math.random() * 100)
      const html = await renderViaHTTP(appPort, `/some-rewrite/${item}`)
      expect(html).toContain(
        `Rewrites don't support dynamic pages with getStaticProps yet`
      )
    })

    it('should not show warning from url prop being returned', async () => {
      const urlPropPage = join(appDir, 'pages/url-prop.js')
      await fs.writeFile(
        urlPropPage,
        `
        export async function getStaticProps() {
          return {
            props: {
              url: 'something'
            }
          }
        }

        export default ({ url }) => <p>url: {url}</p>
      `
      )

      const html = await renderViaHTTP(appPort, '/url-prop')
      await fs.remove(urlPropPage)
      expect(stderr).not.toMatch(
        /The prop `url` is a reserved prop in Next.js for legacy reasons and will be overridden on page \/url-prop/
      )
      expect(html).toMatch(/url:.*?something/)
    })

    it('should always show fallback for page not in getStaticPaths', async () => {
      const html = await renderViaHTTP(appPort, '/blog/post-321')
      const $ = cheerio.load(html)
      expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(true)

      // make another request to ensure it still is
      const html2 = await renderViaHTTP(appPort, '/blog/post-321')
      const $2 = cheerio.load(html2)
      expect(JSON.parse($2('#__NEXT_DATA__').text()).isFallback).toBe(true)
    })

    it('should not show fallback for page in getStaticPaths', async () => {
      const html = await renderViaHTTP(appPort, '/blog/post-1')
      const $ = cheerio.load(html)
      expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(false)

      // make another request to ensure it's still not
      const html2 = await renderViaHTTP(appPort, '/blog/post-1')
      const $2 = cheerio.load(html2)
      expect(JSON.parse($2('#__NEXT_DATA__').text()).isFallback).toBe(false)
    })

    it('should log error in console and browser in dev mode', async () => {
      const origContent = await fs.readFile(indexPage, 'utf8')

      const browser = await webdriver(appPort, '/')
      expect(await browser.elementByCss('p').text()).toMatch(/hello.*?world/)

      await fs.writeFile(
        indexPage,
        origContent
          .replace('// throw new', 'throw new')
          .replace('{/* <div', '<div')
          .replace('</div> */}', '</div>')
      )
      await browser.waitForElementByCss('#after-change')
      // we need to reload the page to trigger getStaticProps
      await browser.refresh()

      expect(await hasRedbox(browser)).toBe(true)
      const errOverlayContent = await getRedboxHeader(browser)

      await fs.writeFile(indexPage, origContent)
      const errorMsg = /oops from getStaticProps/
      expect(stderr).toMatch(errorMsg)
      expect(errOverlayContent).toMatch(errorMsg)
    })

    it('should always call getStaticProps without caching in dev', async () => {
      const initialRes = await fetchViaHTTP(appPort, '/something')
      expect(initialRes.headers.get('cache-control')).toBeFalsy()
      const initialHtml = await initialRes.text()
      expect(initialHtml).toMatch(/hello.*?world/)

      const newRes = await fetchViaHTTP(appPort, '/something')
      expect(newRes.headers.get('cache-control')).toBeFalsy()
      const newHtml = await newRes.text()
      expect(newHtml).toMatch(/hello.*?world/)
      expect(initialHtml !== newHtml).toBe(true)

      const newerRes = await fetchViaHTTP(appPort, '/something')
      expect(newerRes.headers.get('cache-control')).toBeFalsy()
      const newerHtml = await newerRes.text()
      expect(newerHtml).toMatch(/hello.*?world/)
      expect(newHtml !== newerHtml).toBe(true)
    })

    it('should error on bad object from getStaticProps', async () => {
      const origContent = await fs.readFile(indexPage, 'utf8')
      await fs.writeFile(
        indexPage,
        origContent.replace(/\/\/ bad-prop/, 'another: true,')
      )
      await waitFor(1000)
      try {
        const html = await renderViaHTTP(appPort, '/')
        expect(html).toMatch(/Additional keys were returned/)
      } finally {
        await fs.writeFile(indexPage, origContent)
      }
    })

    it('should error on dynamic page without getStaticPaths', async () => {
      const curPage = join(__dirname, '../pages/temp/[slug].js')
      await fs.mkdirp(dirname(curPage))
      await fs.writeFile(
        curPage,
        `
          export async function getStaticProps() {
            return {
              props: {
                hello: 'world'
              }
            }
          }
          export default () => 'oops'
        `
      )
      await waitFor(1000)
      try {
        const html = await renderViaHTTP(appPort, '/temp/hello')
        expect(html).toMatch(
          /getStaticPaths is required for dynamic SSG pages and is missing for/
        )
      } finally {
        await fs.remove(curPage)
      }
    })

    it('should error on dynamic page without getStaticPaths returning fallback property', async () => {
      const curPage = join(__dirname, '../pages/temp2/[slug].js')
      await fs.mkdirp(dirname(curPage))
      await fs.writeFile(
        curPage,
        `
          export async function getStaticPaths() {
            return {
              paths: []
            }
          }
          export async function getStaticProps() {
            return {
              props: {
                hello: 'world'
              }
            }
          }
          export default () => 'oops'
        `
      )
      await waitFor(1000)
      try {
        const html = await renderViaHTTP(appPort, '/temp2/hello')
        expect(html).toMatch(/`fallback` key must be returned from/)
      } finally {
        await fs.remove(curPage)
      }
    })

    it('should not re-call getStaticProps when updating query', async () => {
      const browser = await webdriver(appPort, '/something?hello=world')
      await waitFor(2000)

      const query = await browser.elementByCss('#query').text()
      expect(JSON.parse(query)).toEqual({ hello: 'world' })

      const {
        props: {
          pageProps: { random: initialRandom },
        },
      } = await browser.eval('window.__NEXT_DATA__')

      const curRandom = await browser.elementByCss('#random').text()
      expect(curRandom).toBe(initialRandom + '')
    })

    it('should show fallback before invalid JSON is returned from getStaticProps', async () => {
      const html = await renderViaHTTP(appPort, '/non-json/foobar')
      expect(html).toContain('"isFallback":true')
    })

    it('should show error for invalid JSON returned from getStaticProps on SSR', async () => {
      const browser = await webdriver(appPort, '/non-json/direct')

      // FIXME: enable this
      // expect(await getRedboxHeader(browser)).toMatch(
      //   /Error serializing `.time` returned from `getStaticProps`/
      // )

      // FIXME: disable this
      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toMatch(
        /Failed to load static props/
      )
    })

    it('should show error for invalid JSON returned from getStaticProps on CST', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.elementByCss('#non-json').click()

      // FIXME: enable this
      // expect(await getRedboxHeader(browser)).toMatch(
      //   /Error serializing `.time` returned from `getStaticProps`/
      // )

      // FIXME: disable this
      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toMatch(
        /Failed to load static props/
      )
    })

    it('should not contain headers already sent error', async () => {
      await renderViaHTTP(appPort, '/fallback-only/some-fallback-post')
      expect(stderr).not.toContain('ERR_HTTP_HEADERS_SENT')
    })
  } else {
    if (!isEmulatedServerless) {
      it('should should use correct caching headers for a no-revalidate page', async () => {
        const initialRes = await fetchViaHTTP(appPort, '/something')
        expect(initialRes.headers.get('cache-control')).toBe(
          's-maxage=31536000, stale-while-revalidate'
        )
        const initialHtml = await initialRes.text()
        expect(initialHtml).toMatch(/hello.*?world/)
      })

      it('should not show error for invalid JSON returned from getStaticProps on SSR', async () => {
        const browser = await webdriver(appPort, '/non-json/direct')

        await check(() => getBrowserBodyText(browser), /hello /)
      })

      it('should not show error for invalid JSON returned from getStaticProps on CST', async () => {
        const browser = await webdriver(appPort, '/')
        await browser.elementByCss('#non-json').click()
        await check(() => getBrowserBodyText(browser), /hello /)
      })
    }

    it('outputs dataRoutes in routes-manifest correctly', async () => {
      const { dataRoutes } = JSON.parse(
        await fs.readFile(join(appDir, '.next/routes-manifest.json'), 'utf8')
      )

      for (const route of dataRoutes) {
        route.dataRouteRegex = normalizeRegEx(route.dataRouteRegex)
      }

      expect(dataRoutes).toEqual([
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/index.json$`
          ),
          page: '/',
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/another.json$`
          ),
          page: '/another',
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/bad-gssp.json$`
          ),
          page: '/bad-gssp',
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/bad-ssr.json$`
          ),
          page: '/bad-ssr',
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/blog.json$`
          ),
          page: '/blog',
        },
        {
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/blog/(?<post>[^/]+?)\\.json$`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/blog\\/([^\\/]+?)\\.json$`
          ),
          page: '/blog/[post]',
          routeKeys: {
            post: 'post',
          },
        },
        {
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/blog/(?<post>[^/]+?)/(?<comment>[^/]+?)\\.json$`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/blog\\/([^\\/]+?)\\/([^\\/]+?)\\.json$`
          ),
          page: '/blog/[post]/[comment]',
          routeKeys: {
            post: 'post',
            comment: 'comment',
          },
        },
        {
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/catchall/(?<slug>.+?)\\.json$`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/catchall\\/(.+?)\\.json$`
          ),
          page: '/catchall/[...slug]',
          routeKeys: {
            slug: 'slug',
          },
        },
        {
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/catchall\\-explicit/(?<slug>.+?)\\.json$`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/catchall\\-explicit\\/(.+?)\\.json$`
          ),
          page: '/catchall-explicit/[...slug]',
          routeKeys: {
            slug: 'slug',
          },
        },
        {
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/catchall\\-optional(?:/(?<slug>.+?))?\\.json$`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/catchall\\-optional(?:\\/(.+?))?\\.json$`
          ),
          page: '/catchall-optional/[[...slug]]',
          routeKeys: {
            slug: 'slug',
          },
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/default-revalidate.json$`
          ),
          page: '/default-revalidate',
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/dynamic\\/([^\\/]+?)\\.json$`
          ),
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/dynamic/(?<slug>[^/]+?)\\.json$`,
          page: '/dynamic/[slug]',
          routeKeys: {
            slug: 'slug',
          },
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/fallback\\-only\\/([^\\/]+?)\\.json$`
          ),
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/fallback\\-only/(?<slug>[^/]+?)\\.json$`,
          page: '/fallback-only/[slug]',
          routeKeys: {
            slug: 'slug',
          },
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/index\\/index.json$`
          ),
          page: '/index',
        },
        {
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/lang/(?<lang>[^/]+?)/about\\.json$`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/lang\\/([^\\/]+?)\\/about\\.json$`
          ),
          page: '/lang/[lang]/about',
          routeKeys: {
            lang: 'lang',
          },
        },
        {
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/non\\-json/(?<p>[^/]+?)\\.json$`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/non\\-json\\/([^\\/]+?)\\.json$`
          ),
          page: '/non-json/[p]',
          routeKeys: {
            p: 'p',
          },
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/something.json$`
          ),
          page: '/something',
        },
        {
          namedDataRouteRegex: `^/_next/data/${escapeRegex(
            buildId
          )}/user/(?<user>[^/]+?)/profile\\.json$`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapeRegex(
              buildId
            )}\\/user\\/([^\\/]+?)\\/profile\\.json$`
          ),
          page: '/user/[user]/profile',
          routeKeys: {
            user: 'user',
          },
        },
      ])
    })

    it('outputs a prerender-manifest correctly', async () => {
      const manifest = JSON.parse(
        await fs.readFile(join(appDir, '.next/prerender-manifest.json'), 'utf8')
      )
      const escapedBuildId = escapeRegex(buildId)

      Object.keys(manifest.dynamicRoutes).forEach((key) => {
        const item = manifest.dynamicRoutes[key]

        if (item.dataRouteRegex) {
          item.dataRouteRegex = normalizeRegEx(item.dataRouteRegex)
        }
        if (item.routeRegex) {
          item.routeRegex = normalizeRegEx(item.routeRegex)
        }
      })

      expect(manifest.version).toBe(2)
      expect(manifest.routes).toEqual(expectedManifestRoutes())
      expect(manifest.dynamicRoutes).toEqual({
        '/blog/[post]': {
          fallback: '/blog/[post].html',
          dataRoute: `/_next/data/${buildId}/blog/[post].json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/blog\\/([^\\/]+?)\\.json$`
          ),
          routeRegex: normalizeRegEx('^\\/blog\\/([^\\/]+?)(?:\\/)?$'),
        },
        '/blog/[post]/[comment]': {
          fallback: '/blog/[post]/[comment].html',
          dataRoute: `/_next/data/${buildId}/blog/[post]/[comment].json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/blog\\/([^\\/]+?)\\/([^\\/]+?)\\.json$`
          ),
          routeRegex: normalizeRegEx(
            '^\\/blog\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$'
          ),
        },
        '/dynamic/[slug]': {
          dataRoute: `/_next/data/${buildId}/dynamic/[slug].json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/dynamic\\/([^\\/]+?)\\.json$`
          ),
          fallback: false,
          routeRegex: normalizeRegEx(`^\\/dynamic\\/([^\\/]+?)(?:\\/)?$`),
        },
        '/fallback-only/[slug]': {
          dataRoute: `/_next/data/${buildId}/fallback-only/[slug].json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/fallback\\-only\\/([^\\/]+?)\\.json$`
          ),
          fallback: '/fallback-only/[slug].html',
          routeRegex: normalizeRegEx(
            '^\\/fallback\\-only\\/([^\\/]+?)(?:\\/)?$'
          ),
        },
        '/lang/[lang]/about': {
          dataRoute: `/_next/data/${buildId}/lang/[lang]/about.json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/lang\\/([^\\/]+?)\\/about\\.json$`
          ),
          fallback: false,
          routeRegex: normalizeRegEx('^\\/lang\\/([^\\/]+?)\\/about(?:\\/)?$'),
        },
        '/non-json/[p]': {
          dataRoute: `/_next/data/${buildId}/non-json/[p].json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/non\\-json\\/([^\\/]+?)\\.json$`
          ),
          fallback: '/non-json/[p].html',
          routeRegex: normalizeRegEx('^\\/non\\-json\\/([^\\/]+?)(?:\\/)?$'),
        },
        '/user/[user]/profile': {
          fallback: '/user/[user]/profile.html',
          dataRoute: `/_next/data/${buildId}/user/[user]/profile.json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/user\\/([^\\/]+?)\\/profile\\.json$`
          ),
          routeRegex: normalizeRegEx(
            `^\\/user\\/([^\\/]+?)\\/profile(?:\\/)?$`
          ),
        },

        '/catchall/[...slug]': {
          fallback: '/catchall/[...slug].html',
          routeRegex: normalizeRegEx('^\\/catchall\\/(.+?)(?:\\/)?$'),
          dataRoute: `/_next/data/${buildId}/catchall/[...slug].json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/catchall\\/(.+?)\\.json$`
          ),
        },
        '/catchall-optional/[[...slug]]': {
          dataRoute: `/_next/data/${buildId}/catchall-optional/[[...slug]].json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/catchall\\-optional(?:\\/(.+?))?\\.json$`
          ),
          fallback: false,
          routeRegex: normalizeRegEx(
            '^\\/catchall\\-optional(?:\\/(.+?))?(?:\\/)?$'
          ),
        },
        '/catchall-explicit/[...slug]': {
          dataRoute: `/_next/data/${buildId}/catchall-explicit/[...slug].json`,
          dataRouteRegex: normalizeRegEx(
            `^\\/_next\\/data\\/${escapedBuildId}\\/catchall\\-explicit\\/(.+?)\\.json$`
          ),
          fallback: false,
          routeRegex: normalizeRegEx(
            '^\\/catchall\\-explicit\\/(.+?)(?:\\/)?$'
          ),
        },
      })
    })

    it('outputs prerendered files correctly', async () => {
      const routes = [
        '/another',
        '/something',
        '/blog/post-1',
        '/blog/post-2/comment-2',
      ]

      for (const route of routes) {
        await fs.access(join(distPagesDir, `${route}.html`), fs.constants.F_OK)
        await fs.access(join(distPagesDir, `${route}.json`), fs.constants.F_OK)
      }
    })

    if (!isEmulatedServerless) {
      it('should handle de-duping correctly', async () => {
        let vals = new Array(10).fill(null)

        // use data route so we don't get the fallback
        vals = await Promise.all(
          vals.map(() =>
            renderViaHTTP(appPort, `/_next/data/${buildId}/blog/post-10.json`)
          )
        )
        const val = vals[0]

        expect(JSON.parse(val).pageProps.post).toBe('post-10')
        expect(new Set(vals).size).toBe(1)
      })
    }

    it('should not revalidate when set to false', async () => {
      const route = '/something'
      const initialHtml = await renderViaHTTP(appPort, route)
      let newHtml = await renderViaHTTP(appPort, route)
      expect(initialHtml).toBe(newHtml)

      newHtml = await renderViaHTTP(appPort, route)
      expect(initialHtml).toBe(newHtml)

      newHtml = await renderViaHTTP(appPort, route)
      expect(initialHtml).toBe(newHtml)
    })

    if (!isEmulatedServerless) {
      it('should handle revalidating HTML correctly', async () => {
        const route = '/blog/post-2/comment-2'
        const initialHtml = await renderViaHTTP(appPort, route)
        expect(initialHtml).toMatch(/Post:.*?post-2/)
        expect(initialHtml).toMatch(/Comment:.*?comment-2/)

        let newHtml = await renderViaHTTP(appPort, route)
        expect(newHtml).toBe(initialHtml)

        await waitFor(2 * 1000)
        await renderViaHTTP(appPort, route)

        await waitFor(2 * 1000)
        newHtml = await renderViaHTTP(appPort, route)
        expect(newHtml === initialHtml).toBe(false)
        expect(newHtml).toMatch(/Post:.*?post-2/)
        expect(newHtml).toMatch(/Comment:.*?comment-2/)
      })

      it('should handle revalidating JSON correctly', async () => {
        const route = `/_next/data/${buildId}/blog/post-2/comment-3.json`
        const initialJson = await renderViaHTTP(appPort, route)
        expect(initialJson).toMatch(/post-2/)
        expect(initialJson).toMatch(/comment-3/)

        let newJson = await renderViaHTTP(appPort, route)
        expect(newJson).toBe(initialJson)

        await waitFor(2 * 1000)
        await renderViaHTTP(appPort, route)

        await waitFor(2 * 1000)
        newJson = await renderViaHTTP(appPort, route)
        expect(newJson === initialJson).toBe(false)
        expect(newJson).toMatch(/post-2/)
        expect(newJson).toMatch(/comment-3/)
      })
    }

    it('should not fetch prerender data on mount', async () => {
      const browser = await webdriver(appPort, '/blog/post-100')
      await browser.eval('window.thisShouldStay = true')
      await waitFor(2 * 1000)
      const val = await browser.eval('window.thisShouldStay')
      expect(val).toBe(true)
    })

    it('should not error when flushing cache files', async () => {
      await fetchViaHTTP(appPort, '/user/user-1/profile')
      await waitFor(500)
      expect(stderr).not.toMatch(/Failed to update prerender files for/)
    })

    if (isEmulatedServerless) {
      it('should fail the api function instead of rendering 500', async () => {
        const res = await fetchViaHTTP(appPort, '/api/bad')
        expect(res.status).toBe(500)
        expect(await res.text()).toBe('FAIL_FUNCTION')
      })

      it('should fail the page function instead of rendering 500 (getServerSideProps)', async () => {
        const res = await fetchViaHTTP(appPort, '/bad-gssp')
        expect(res.status).toBe(500)
        expect(await res.text()).toBe('FAIL_FUNCTION')
      })

      it('should fail the page function instead of rendering 500 (render)', async () => {
        const res = await fetchViaHTTP(appPort, '/bad-ssr')
        expect(res.status).toBe(500)
        expect(await res.text()).toBe('FAIL_FUNCTION')
      })

      it('should call /_error GIP on 500', async () => {
        stderr = ''
        const res = await fetchViaHTTP(appPort, '/bad-gssp')
        expect(res.status).toBe(500)
        expect(await res.text()).toBe('FAIL_FUNCTION')
        expect(stderr).toMatch('CUSTOM_ERROR_GIP_CALLED')
        expect(stderr).not.toMatch('!!! WARNING !!!')
      })
    }
  }
}

describe('SSG Prerender', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      origConfig = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          rewrites() {
            return [
              {
                source: "/some-rewrite/:item",
                destination: "/blog/post-:item"
              },
              {
                source: '/about',
                destination: '/lang/en/about'
              }
            ]
          }
        }
      `
      )
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
        onStderr: (msg) => {
          stderr += msg
        },
      })
      buildId = 'development'
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origConfig)
      await killApp(app)
    })

    runTests(true)
  })

  describe('dev mode getStaticPaths', () => {
    beforeAll(async () => {
      origConfig = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        // we set cpus to 1 so that we make sure the requests
        // aren't being cached at the jest-worker level
        `module.exports = { experimental: { cpus: 1 } }`,
        'utf8'
      )
      await fs.remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
      })
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origConfig)
      await killApp(app)
    })

    it('should work with firebase import and getStaticPaths', async () => {
      const html = await renderViaHTTP(appPort, '/blog/post-1')
      expect(html).toContain('post-1')
      expect(html).not.toContain('Error: Failed to load')

      const html2 = await renderViaHTTP(appPort, '/blog/post-1')
      expect(html2).toContain('post-1')
      expect(html2).not.toContain('Error: Failed to load')
    })

    it('should not cache getStaticPaths errors', async () => {
      const errMsg = /The `fallback` key must be returned from getStaticPaths/
      await check(() => renderViaHTTP(appPort, '/blog/post-1'), /post-1/)

      const blogPage = join(appDir, 'pages/blog/[post]/index.js')
      const origContent = await fs.readFile(blogPage, 'utf8')
      await fs.writeFile(
        blogPage,
        origContent.replace('fallback: true,', '/* fallback: true, */')
      )

      try {
        await check(() => renderViaHTTP(appPort, '/blog/post-1'), errMsg)

        await fs.writeFile(blogPage, origContent)
        await check(() => renderViaHTTP(appPort, '/blog/post-1'), /post-1/)
      } finally {
        await fs.writeFile(blogPage, origContent)
      }
    })
  })

  describe('serverless mode', () => {
    const blogPagePath = join(appDir, 'pages/blog/[post]/index.js')
    let origBlogPageContent

    beforeAll(async () => {
      // remove firebase import since it breaks in legacy serverless mode
      origBlogPageContent = await fs.readFile(blogPagePath, 'utf8')
      origConfig = await fs.readFile(nextConfig, 'utf8')

      await fs.writeFile(
        blogPagePath,
        origBlogPageContent.replace(
          `import 'firebase/firestore'`,
          `// import 'firebase/firestore'`
        )
      )

      await fs.writeFile(
        nextConfig,
        `module.exports = {
          target: 'serverless',
          rewrites() {
            return [
              {
                source: '/about',
                destination: '/lang/en/about'
              }
            ]
          }
        }`,
        'utf8'
      )
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)
      stderr = ''
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        onStderr: (msg) => {
          stderr += msg
        },
      })
      distPagesDir = join(appDir, '.next/serverless/pages')
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origConfig)
      await fs.writeFile(blogPagePath, origBlogPageContent)
      await killApp(app)
    })

    it('renders data correctly', async () => {
      const port = await findPort()
      const server = await startServer({
        BUILD_ID: buildId,
        PORT: port,
      })
      const data = await renderViaHTTP(
        port,
        `/_next/data/${buildId}/index.json`
      )
      await killApp(server)
      expect(JSON.parse(data).pageProps.world).toBe('world')
    })

    runTests()

    it('should not show invalid error', async () => {
      const brokenPage = join(appDir, 'pages/broken.js')
      await fs.writeFile(
        brokenPage,
        `
        export async function getStaticProps() {
          return {
            hello: 'world'
          }
        }
        export default () => 'hello world'
      `
      )
      await fs.remove(join(appDir, '.next'))
      const { stderr } = await nextBuild(appDir, [], { stderr: true })
      await fs.remove(brokenPage)
      expect(stderr).toContain(
        'Additional keys were returned from `getStaticProps`'
      )
      expect(stderr).not.toContain(
        'You can not use getInitialProps with getStaticProps'
      )
    })

    it('should show serialization error during build', async () => {
      await fs.remove(join(appDir, '.next'))

      const nonJsonPage = join(appDir, 'pages/non-json/[p].js')
      const f = new File(nonJsonPage)
      try {
        f.replace('paths: []', `paths: [{ params: { p: 'testing' } }]`)

        const { stderr } = await nextBuild(appDir, [], { stderr: true })
        expect(stderr).toContain(
          'Error serializing `.time` returned from `getStaticProps` in "/non-json/[p]".'
        )
      } finally {
        f.restore()
      }
    })
  })

  describe('enumlated serverless mode', () => {
    const cstmError = join(appDir, 'pages', '_error.js')

    beforeAll(async () => {
      const startServerlessEmulator = async (dir, port, buildId) => {
        const scriptPath = join(dir, 'server.js')
        const env = Object.assign(
          {},
          { ...process.env },
          { PORT: port, BUILD_ID: buildId }
        )
        return initNextServerScript(scriptPath, /ready on/i, env, false, {
          onStderr: (msg) => {
            stderr += msg
          },
        })
      }

      origConfig = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'experimental-serverless-trace' }`,
        'utf8'
      )
      await fs.writeFile(
        cstmError,
        `
          function Error() {
            return <div />
          }

          Error.getInitialProps = () => {
            console.error('CUSTOM_ERROR_GIP_CALLED')
            return {}
          }

          export default Error
        `
      )
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)

      distPagesDir = join(appDir, '.next/serverless/pages')
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')

      stderr = ''
      appPort = await findPort()
      app = await startServerlessEmulator(appDir, appPort, buildId)
    })
    afterAll(async () => {
      await fs.remove(cstmError)
      await fs.writeFile(nextConfig, origConfig)
      await killApp(app)
    })

    runTests(false, true)
  })

  describe('production mode', () => {
    let buildOutput = ''
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      const { stdout } = await nextBuild(appDir, [], { stdout: true })
      buildOutput = stdout

      stderr = ''
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        onStderr: (msg) => {
          stderr += msg
        },
      })
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
      // TODO: Don't rely on this path
      distPagesDir = join(appDir, '.next', 'server', 'pages')
    })
    afterAll(() => killApp(app))

    it('should of formatted build output correctly', () => {
      expect(buildOutput).toMatch(/○ \/normal/)
      expect(buildOutput).toMatch(/● \/blog\/\[post\]/)
      expect(buildOutput).toMatch(/\+2 more paths/)
    })

    runTests()
  })

  describe('export mode', () => {
    // disable fallback: true since this is an error during `next export`
    const fallbackTruePages = [
      '/blog/[post]/[comment].js',
      '/user/[user]/profile.js',
      '/catchall/[...slug].js',
      '/non-json/[p].js',
      '/blog/[post]/index.js',
      '/fallback-only/[slug].js',
    ]

    const brokenPages = ['/bad-gssp.js', '/bad-ssr.js']

    const fallbackTruePageContents = {}

    beforeAll(async () => {
      exportDir = join(appDir, 'out')
      origConfig = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `module.exports = {
          exportTrailingSlash: true,
          exportPathMap: function(defaultPathMap) {
            if (defaultPathMap['/blog/[post]']) {
              throw new Error('Found Incremental page in the default export path map')
            }
            return defaultPathMap
          },
        }`
      )
      await fs.remove(join(appDir, '.next'))

      for (const page of fallbackTruePages) {
        const pagePath = join(appDir, 'pages', page)
        fallbackTruePageContents[page] = await fs.readFile(pagePath, 'utf8')
        await fs.writeFile(
          pagePath,
          fallbackTruePageContents[page].replace(
            'fallback: true',
            'fallback: false'
          )
        )
      }

      for (const page of brokenPages) {
        const pagePath = join(appDir, 'pages', page)
        await fs.rename(pagePath, `${pagePath}.bak`)
      }

      await nextBuild(appDir)
      await nextExport(appDir, { outdir: exportDir })
      app = await startStaticServer(exportDir)
      appPort = app.address().port
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origConfig)
      await stopApp(app)

      for (const page of fallbackTruePages) {
        const pagePath = join(appDir, 'pages', page)

        await fs.writeFile(pagePath, fallbackTruePageContents[page])
      }

      for (const page of brokenPages) {
        const pagePath = join(appDir, 'pages', page)
        await fs.rename(`${pagePath}.bak`, pagePath)
      }
    })

    it('should copy prerender files and honor exportTrailingSlash', async () => {
      const routes = [
        '/another',
        '/something',
        '/blog/post-1',
        '/blog/post-2/comment-2',
      ]

      for (const route of routes) {
        await fs.access(join(exportDir, `${route}/index.html`))
        await fs.access(join(exportDir, '_next/data', buildId, `${route}.json`))
      }
    })

    navigateTest()
  })
})
