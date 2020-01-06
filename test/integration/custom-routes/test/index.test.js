/* eslint-env jest */
/* global jasmine */
import url from 'url'
import stripAnsi from 'strip-ansi'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
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
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')
let nextConfigContent
let buildId
let stdout = ''
let appPort
let app

const escapeRegex = str => str.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')

const runTests = (isDev = false) => {
  it('should handle one-to-one rewrite successfully', async () => {
    const html = await renderViaHTTP(appPort, '/first')
    expect(html).toMatch(/hello/)
  })

  it('should handle chained rewrites successfully', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/multi-rewrites/)
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

  it('should redirect successfully with default statusCode', async () => {
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
    const { pathname, hash } = url.parse(res.headers.get('location'))
    expect(res.status).toBe(301)
    expect(pathname).toBe('/docs/v2/network/status-codes')
    expect(hash).toBe('#500')
  })

  it('should redirect successfully with provided statusCode', async () => {
    const res = await fetchViaHTTP(appPort, '/redirect2', undefined, {
      redirect: 'manual',
    })
    const { pathname } = url.parse(res.headers.get('location'))
    expect(res.status).toBe(301)
    expect(pathname).toBe('/')
  })

  it('should server static files through a rewrite', async () => {
    const text = await renderViaHTTP(appPort, '/hello-world')
    expect(text).toBe('hello world!')
  })

  it('should rewrite with params successfully', async () => {
    const html = await renderViaHTTP(appPort, '/test/hello')
    expect(html).toMatch(/Hello/)
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
    expect(query).toEqual({ first: 'hello', second: 'world' })
  })

  it('should overwrite param values correctly', async () => {
    const html = await renderViaHTTP(appPort, '/test-overwrite/first/second')
    expect(html).toMatch(/this-should-be-the-value/)
    expect(html).not.toMatch(/first/)
    expect(html).toMatch(/second/)
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
    await renderViaHTTP(appPort, '/hello')
    const data = await renderViaHTTP(
      appPort,
      `/hidden/_next/static/${buildId}/pages/hello.js`
    )
    expect(data).toContain('Hello')
    expect(data).toContain('createElement')
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
    const res = await fetchViaHTTP(appPort, '/add-header')
    expect(res.headers.get('x-custom-header')).toBe('hello world')
    expect(res.headers.get('x-another-header')).toBe('hello again')
  })

  it('should apply headers for multi match', async () => {
    const res = await fetchViaHTTP(appPort, '/my-headers/first')
    expect(res.headers.get('x-first-header')).toBe('first')
    expect(res.headers.get('x-second-header')).toBe('second')
  })

  if (!isDev) {
    it('should output routes-manifest successfully', async () => {
      const manifest = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )

      for (const route of [...manifest.dynamicRoutes, ...manifest.rewrites]) {
        route.regex = normalizeRegEx(route.regex)
      }

      expect(manifest).toEqual({
        version: 1,
        basePath: '',
        redirects: [
          {
            source: '/docs/router-status/:code',
            destination: '/docs/v2/network/status-codes#:code',
            statusCode: 301,
            regex: normalizeRegEx('^\\/docs\\/router-status(?:\\/([^\\/]+?))$'),
            regexKeys: ['code'],
          },
          {
            source: '/docs/github',
            destination: '/docs/v2/advanced/now-for-github',
            statusCode: 301,
            regex: normalizeRegEx('^\\/docs\\/github$'),
            regexKeys: [],
          },
          {
            source: '/docs/v2/advanced/:all(.*)',
            destination: '/docs/v2/more/:all',
            statusCode: 301,
            regex: normalizeRegEx('^\\/docs\\/v2\\/advanced(?:\\/(.*))$'),
            regexKeys: ['all'],
          },
          {
            source: '/hello/:id/another',
            destination: '/blog/:id',
            statusCode: 307,
            regex: normalizeRegEx('^\\/hello(?:\\/([^\\/]+?))\\/another$'),
            regexKeys: ['id'],
          },
          {
            source: '/redirect1',
            destination: '/',
            statusCode: 307,
            regex: normalizeRegEx('^\\/redirect1$'),
            regexKeys: [],
          },
          {
            source: '/redirect2',
            destination: '/',
            statusCode: 301,
            regex: normalizeRegEx('^\\/redirect2$'),
            regexKeys: [],
          },
          {
            source: '/redirect3',
            destination: '/another',
            statusCode: 302,
            regex: normalizeRegEx('^\\/redirect3$'),
            regexKeys: [],
          },
          {
            source: '/redirect4',
            destination: '/',
            statusCode: 308,
            regex: normalizeRegEx('^\\/redirect4$'),
            regexKeys: [],
          },
          {
            source: '/redir-chain1',
            destination: '/redir-chain2',
            statusCode: 301,
            regex: normalizeRegEx('^\\/redir-chain1$'),
            regexKeys: [],
          },
          {
            source: '/redir-chain2',
            destination: '/redir-chain3',
            statusCode: 302,
            regex: normalizeRegEx('^\\/redir-chain2$'),
            regexKeys: [],
          },
          {
            source: '/redir-chain3',
            destination: '/',
            statusCode: 303,
            regex: normalizeRegEx('^\\/redir-chain3$'),
            regexKeys: [],
          },
          {
            destination: 'https://google.com',
            regex: normalizeRegEx('^\\/to-external$'),
            regexKeys: [],
            source: '/to-external',
            statusCode: 307,
          },
          {
            destination: '/with-params?first=:section&second=:name',
            regex: normalizeRegEx(
              '^\\/query-redirect(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$'
            ),
            regexKeys: ['section', 'name'],
            source: '/query-redirect/:section/:name',
            statusCode: 307,
          },
        ],
        headers: [
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
            regex: normalizeRegEx('^\\/add-header$'),
            regexKeys: [],
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
            regex: normalizeRegEx('^\\/my-headers(?:\\/(.*))$'),
            regexKeys: [0],
            source: '/my-headers/(.*)',
          },
        ],
        rewrites: [
          {
            destination: '/another/one',
            regex: normalizeRegEx('^\\/to-another$'),
            regexKeys: [],
            source: '/to-another',
          },
          {
            source: '/hello-world',
            destination: '/static/hello.txt',
            regex: normalizeRegEx('^\\/hello-world$'),
            regexKeys: [],
          },
          {
            source: '/',
            destination: '/another',
            regex: normalizeRegEx('^\\/$'),
            regexKeys: [],
          },
          {
            source: '/another',
            destination: '/multi-rewrites',
            regex: normalizeRegEx('^\\/another$'),
            regexKeys: [],
          },
          {
            source: '/first',
            destination: '/hello',
            regex: normalizeRegEx('^\\/first$'),
            regexKeys: [],
          },
          {
            source: '/second',
            destination: '/hello-again',
            regex: normalizeRegEx('^\\/second$'),
            regexKeys: [],
          },
          {
            destination: '/hello',
            regex: normalizeRegEx('^\\/to-hello$'),
            regexKeys: [],
            source: '/to-hello',
          },
          {
            destination: '/blog/post-2',
            regex: normalizeRegEx('^\\/blog\\/post-1$'),
            regexKeys: [],
            source: '/blog/post-1',
          },
          {
            source: '/test/:path',
            destination: '/:path',
            regex: normalizeRegEx('^\\/test(?:\\/([^\\/]+?))$'),
            regexKeys: ['path'],
          },
          {
            source: '/test-overwrite/:something/:another',
            destination: '/params/this-should-be-the-value',
            regex: normalizeRegEx(
              '^\\/test-overwrite(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$'
            ),
            regexKeys: ['something', 'another'],
          },
          {
            source: '/params/:something',
            destination: '/with-params',
            regex: normalizeRegEx('^\\/params(?:\\/([^\\/]+?))$'),
            regexKeys: ['something'],
          },
          {
            destination: '/with-params?first=:section&second=:name',
            regex: normalizeRegEx(
              '^\\/query-rewrite(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$'
            ),
            regexKeys: ['section', 'name'],
            source: '/query-rewrite/:section/:name',
          },
          {
            destination: '/_next/:path*',
            regex: normalizeRegEx(
              '^\\/hidden\\/_next(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?$'
            ),
            regexKeys: ['path'],
            source: '/hidden/_next/:path*',
          },
        ],
        dynamicRoutes: [
          {
            page: '/another/[id]',
            regex: normalizeRegEx('^\\/another\\/([^\\/]+?)(?:\\/)?$'),
          },
          {
            page: '/blog/[post]',
            regex: normalizeRegEx('^\\/blog\\/([^\\/]+?)(?:\\/)?$'),
          },
        ],
      })
    })

    it('should have redirects/rewrites in build output', async () => {
      const manifest = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )
      const cleanStdout = stripAnsi(stdout)
      expect(cleanStdout).toContain('Redirects')
      expect(cleanStdout).toContain('Rewrites')
      expect(cleanStdout).toMatch(/Source.*?Destination.*?statusCode/i)

      for (const route of [...manifest.redirects, ...manifest.rewrites]) {
        expect(cleanStdout).toMatch(
          new RegExp(
            `${escapeRegex(route.source)}.*?${escapeRegex(route.destination)}`
          )
        )
      }
    })
  } else {
    it('should show error for dynamic auto export rewrite', async () => {
      const html = await renderViaHTTP(appPort, '/to-another')
      expect(html).toContain(
        `Rewrites don't support auto-exported dynamic pages yet`
      )
    })
  }
}

describe('Custom routes', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      buildId = 'development'
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('server mode', () => {
    beforeAll(async () => {
      const { stdout: buildStdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
      stdout = buildStdout
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))
    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      nextConfigContent = await fs.readFile(nextConfigPath, 'utf8')
      await fs.writeFile(
        nextConfigPath,
        nextConfigContent.replace(/\/\/ target/, 'target'),
        'utf8'
      )
      const { stdout: buildStdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
      stdout = buildStdout
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        onStdout: msg => {
          stdout += msg
        },
      })
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(async () => {
      await killApp(app)
      await fs.writeFile(nextConfigPath, nextConfigContent, 'utf8')
    })

    runTests()
  })
})
