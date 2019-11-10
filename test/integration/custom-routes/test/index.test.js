/* eslint-env jest */
/* global jasmine */
import url from 'url'
import fs from 'fs-extra'
import { join } from 'path'
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
  waitFor
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')
let nextConfigContent
let appPort
let app

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
    const res = await fetchViaHTTP(appPort, '/redir-chain1', undefined, {
      redirect: 'manual'
    })
    const { pathname } = url.parse(res.headers.get('location'))
    expect(res.status).toBe(303)
    expect(pathname).toBe('/')
  })

  it('should redirect successfully with default statusCode', async () => {
    const res = await fetchViaHTTP(appPort, '/redirect1', undefined, {
      redirect: 'manual'
    })
    const { pathname } = url.parse(res.headers.get('location'))
    expect(res.status).toBe(307)
    expect(pathname).toBe('/')
  })

  it('should redirect with params successfully', async () => {
    const res = await fetchViaHTTP(appPort, '/hello/123/another', undefined, {
      redirect: 'manual'
    })
    const { pathname } = url.parse(res.headers.get('location'))
    expect(res.status).toBe(307)
    expect(pathname).toBe('/blog/123')
  })

  it('should redirect successfully with provided statusCode', async () => {
    const res = await fetchViaHTTP(appPort, '/redirect2', undefined, {
      redirect: 'manual'
    })
    const { pathname } = url.parse(res.headers.get('location'))
    expect(res.status).toBe(301)
    expect(pathname).toBe('/')
  })

  it('should rewrite with params successfully', async () => {
    const html = await renderViaHTTP(appPort, '/test/hello')
    expect(html).toMatch(/Hello/)
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

  if (!isDev) {
    it('should output routes-manifest successfully', async () => {
      const manifest = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )
      expect(manifest).toEqual({
        version: 1,
        redirects: [
          {
            source: '/hello/:id/another',
            destination: '/blog/:id',
            statusCode: 307,
            regex: '^\\/hello\\/([^\\/]+?)\\/another$',
            regexKeys: ['id']
          },
          {
            source: '/redirect1',
            destination: '/',
            statusCode: 307,
            regex: '^\\/redirect1$',
            regexKeys: []
          },
          {
            source: '/redirect2',
            destination: '/',
            statusCode: 301,
            regex: '^\\/redirect2$',
            regexKeys: []
          },
          {
            source: '/redirect3',
            destination: '/another',
            statusCode: 302,
            regex: '^\\/redirect3$',
            regexKeys: []
          },
          {
            source: '/redirect4',
            destination: '/',
            statusCode: 308,
            regex: '^\\/redirect4$',
            regexKeys: []
          },
          {
            source: '/redir-chain1',
            destination: '/redir-chain2',
            statusCode: 301,
            regex: '^\\/redir-chain1$',
            regexKeys: []
          },
          {
            source: '/redir-chain2',
            destination: '/redir-chain3',
            statusCode: 302,
            regex: '^\\/redir-chain2$',
            regexKeys: []
          },
          {
            source: '/redir-chain3',
            destination: '/',
            statusCode: 303,
            regex: '^\\/redir-chain3$',
            regexKeys: []
          }
        ],
        rewrites: [
          {
            source: '/',
            destination: '/another',
            regex: '^\\/$',
            regexKeys: []
          },
          {
            source: '/another',
            destination: '/multi-rewrites',
            regex: '^\\/another$',
            regexKeys: []
          },
          {
            source: '/first',
            destination: '/hello',
            regex: '^\\/first$',
            regexKeys: []
          },
          {
            source: '/second',
            destination: '/hello-again',
            regex: '^\\/second$',
            regexKeys: []
          },
          {
            source: '/test/:path',
            destination: '/:path',
            regex: '^\\/test\\/([^\\/]+?)$',
            regexKeys: ['path']
          },
          {
            source: '/test-overwrite/:something/:another',
            destination: '/params/this-should-be-the-value',
            regex: '^\\/test-overwrite\\/([^\\/]+?)\\/([^\\/]+?)$',
            regexKeys: ['something', 'another']
          },
          {
            source: '/params/:something',
            destination: '/with-params',
            regex: '^\\/params\\/([^\\/]+?)$',
            regexKeys: ['something']
          }
        ],
        dynamicRoutes: []
      })
    })
  }
}

describe('Custom routes', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
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
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.writeFile(nextConfigPath, nextConfigContent, 'utf8')
    })

    runTests()
  })
})
