/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)
const context = {}
context.appDir = join(__dirname, '../')

describe('Edge middleware tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort)
    })
    afterAll(() => killApp(context.app))
    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(context.appDir)
      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort)
    })
    afterAll(() => killApp(context.app))
    runTests()
  })
})

function runTests() {
  it('should write a response after chained edge executions', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      '/rewrite-me-to-about-with-chained-sequence'
    )
    const html = await res.text()
    const browser = await webdriver(
      context.appPort,
      '/rewrite-me-to-about-with-chained-sequence'
    )
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        '/rewrite-me-to-about-with-chained-sequence'
      )
    } finally {
      await browser.close()
    }
    expect(res.headers.get('x-middleware-count')).toBe('2')
    expect(html).toBe('this is a chained response')
  })

  it('should stream a response', async () => {
    const res = await fetchViaHTTP(context.appPort, '/stream-response')
    const html = await res.text()
    expect(res.headers.get('x-middleware-count')).toBe('1')
    expect(html).toBe('this is a streamed response')
  })

  it('should append a new header and rewrite to a/b test', async () => {
    const res = await fetchViaHTTP(context.appPort, '/home')
    const html = await res.text()
    const $ = cheerio.load(html)
    const bucket = getCookieFromResponse(res, 'bucket')
    const expectedText = bucket === 'a' ? 'Welcome Page A' : 'Welcome Page B'
    const browser = await webdriver(context.appPort, '/home')
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe('/home')
    } finally {
      await browser.close()
    }
    // -1 is returned if bucket was not found in func getCookieFromResponse
    expect(bucket).not.toBe(-1)
    expect($('.title').text()).toBe(expectedText)
  })

  it('should rewrite to about page when rewrite-me-to-about is called', async () => {
    const res = await fetchViaHTTP(context.appPort, '/rewrite-me-to-about')
    const html = await res.text()
    const $ = cheerio.load(html)
    const browser = await webdriver(context.appPort, '/rewrite-me-to-about')
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        '/rewrite-me-to-about'
      )
    } finally {
      await browser.close()
    }
    expect($('.title').text()).toBe('About Page')
  })

  it('should render the right content', async () => {
    const res = await fetchViaHTTP(context.appPort, '/')
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('Hello World')
  })

  it('should redirect', async () => {
    const res = await fetchViaHTTP(context.appPort, '/account')
    const html = await res.text()
    const $ = cheerio.load(html)
    const browser = await webdriver(context.appPort, '/account')
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        '/account/new-page'
      )
    } finally {
      await browser.close()
    }
    expect($('.title').text()).toBe('Welcome to a new page')
  })

  it('should rewrite to external link', async () => {
    const res = await fetchViaHTTP(context.appPort, '/rewrite-me-to-vercel')
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('head > title').text()).toBe(
      'Develop. Preview. Ship. For the best frontend teams – Vercel'
    )
  })

  it('should contain 2 headers due to nested effects', async () => {
    const res = await fetchViaHTTP(context.appPort, '/posts/1')
    const html = await res.text()
    const $ = cheerio.load(html)
    expect(res.headers.get('x-bar')).toBe('foo')
    expect(res.headers.get('x-middleware-count')).toBe('2')
    expect(res.headers.has('x-middleware-refresh')).toBe(false)
    expect($('.title').text()).toBe('Post')
  })

  it('should only stream once given the stream ends', async () => {
    const res = await fetchViaHTTP(context.appPort, '/stream-end-stream')
    const html = await res.text()
    expect(res.headers.get('x-middleware-count')).toBe('1')
    expect(html).toBe('first stream')
  })

  it('should have a body and not have a certain header', async () => {
    const res = await fetchViaHTTP(context.appPort, '/end-headers')
    const html = await res.text()
    expect(res.headers.get('x-middleware-count')).toBe('1')
    expect(res.headers.get('x-machina')).not.toBe('hello')
    expect(html).toBe('hello world')
  })

  it('should stream a body and not have a certain header', async () => {
    const res = await fetchViaHTTP(context.appPort, '/stream-header-end')
    const html = await res.text()
    expect(res.headers.get('x-middleware-count')).toBe('1')
    expect(res.headers.get('x-machina')).not.toBe('hello')
    expect(res.headers.get('x-pre-header')).toBe('1')
    expect(html).toBe('hello world')
  })

  it('should only recieve the first body', async () => {
    const res = await fetchViaHTTP(context.appPort, '/body-end')
    const html = await res.text()
    expect(res.headers.get('x-middleware-count')).toBe('1')
    expect(html).toBe('hello world')
  })

  it('should rewrite only once to Github', async () => {
    const res = await fetchViaHTTP(context.appPort, '/rewrite-header')
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('head > title').text()).toBe(
      'GitHub: Where the world builds software · GitHub'
    )
  })

  it('should redirect to Google and not send a body', async () => {
    const res = await fetchViaHTTP(context.appPort, '/redirect-body')
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('head > title').text()).toBe('Google')
    expect(html).not.toBe('whoops!')
  })

  it('should redirect only once to Google and not stream a response', async () => {
    const res = await fetchViaHTTP(context.appPort, '/redirect-stream')
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('head > title').text()).toBe('Google')
    expect(html).not.toBe('whoops!')
  })

  it('should validate request url parameters from a static route', async () => {
    const res = await fetchViaHTTP(context.appPort, '/account/request-parse')
    expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/account/request-parse')
    expect(res.headers.get('req-url-params')).toBe('{}')
  })

  it('should validate request url parameters from a dynamic route', async () => {
    const res = await fetchViaHTTP(context.appPort, '/dynamic/1')
    expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/dynamic/1')
    expect(res.headers.get('req-url-params')).toBe('{"id":"1"}')
    expect(res.headers.get('req-url-page')).toBe('/dynamic/[id]')
  })

  it('should rewrite without hard navigation', async () => {
    const browser = await webdriver(context.appPort, '/')
    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#link-with-rewritten-url').click()
    await browser.waitForElementByCss('.refreshed')
    expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
    const element = await browser.elementByCss('.middleware')
    expect(await element.text()).toEqual('foo')
  })
}

function getCookieFromResponse(res, cookieName) {
  // node-fetch bundles the cookies as string in the Response
  const cookieArray = res.headers.raw()['set-cookie']
  for (const cookie of cookieArray) {
    let individualCookieParams = cookie.split(';')
    let individualCookie = individualCookieParams[0].split('=')
    if (individualCookie[0] === cookieName) {
      return individualCookie[1]
    }
  }
  return -1
}
