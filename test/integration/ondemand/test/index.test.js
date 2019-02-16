/* eslint-env jest */
/* global jasmine */
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import webdriver from 'next-webdriver'
import WebSocket from 'ws'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  check,
  getBrowserBodyText
} from 'next-test-utils'

const context = {}

const doPing = path => {
  return new Promise(resolve => {
    context.ws.onmessage = () => resolve()
    context.ws.send(path)
  })
}

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('On Demand Entries', () => {
  it('should pass', () => {})
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)
    await new Promise(resolve => {
      fetchViaHTTP(context.appPort, '/_next/on-demand-entries-ping').then(res => {
        const wsPort = res.headers.get('port')
        context.ws = new WebSocket(
          `ws://localhost:${wsPort}`
        )
        context.ws.on('open', () => resolve())
      })
    })
  })
  afterAll(() => {
    context.ws.close()
    killApp(context.server)
  })

  it('should compile pages for SSR', async () => {
    // The buffer of built page uses the on-demand-entries-ping to know which pages should be
    // buffered. Therefore, we need to double each render call with a ping.
    const pageContent = await renderViaHTTP(context.appPort, '/')
    await doPing('/')
    expect(pageContent.includes('Index Page')).toBeTruthy()
  })

  it('should compile pages for JSON page requests', async () => {
    const pageContent = await renderViaHTTP(
      context.appPort,
      '/_next/static/development/pages/about.js'
    )
    expect(pageContent.includes('About Page')).toBeTruthy()
  })

  it('should dispose inactive pages', async () => {
    const indexPagePath = resolve(__dirname, '../.next/static/development/pages/index.js')
    expect(existsSync(indexPagePath)).toBeTruthy()

    // Render two pages after the index, since the server keeps at least two pages
    await renderViaHTTP(context.appPort, '/about')
    await doPing('/about')
    const aboutPagePath = resolve(__dirname, '../.next/static/development/pages/about.js')

    await renderViaHTTP(context.appPort, '/third')
    await doPing('/third')
    const thirdPagePath = resolve(__dirname, '../.next/static/development/pages/third.js')

    // Wait maximum of jasmine.DEFAULT_TIMEOUT_INTERVAL checking
    // for disposing /about
    while (true) {
      await waitFor(1000 * 1)
      // Assert that the two lastly demanded page are not disposed
      expect(existsSync(aboutPagePath)).toBeTruthy()
      expect(existsSync(thirdPagePath)).toBeTruthy()
      if (!existsSync(indexPagePath)) return
    }
  })

  it('should navigate to pages with dynamic imports', async () => {
    let browser
    try {
      browser = await webdriver(context.appPort, '/nav')

      await browser.eval('document.getElementById("to-dynamic").click()')

      await check(async () => {
        const text = await getBrowserBodyText(browser)
        return text
      }, /Hello/)
    } finally {
      if (browser) {
        browser.close()
      }
    }
  })

  it('should able to ping using fetch fallback', async () => {
    const about = await renderViaHTTP(context.appPort, '/_next/on-demand-entries-ping', {page: '/about'})
    expect(JSON.parse(about)).toEqual({success: true})

    const third = await renderViaHTTP(context.appPort, '/_next/on-demand-entries-ping', {page: '/third'})
    expect(JSON.parse(third)).toEqual({success: true})
  })
})
