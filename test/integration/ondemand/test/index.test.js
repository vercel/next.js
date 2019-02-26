/* eslint-env jest */
/* global jasmine, browser */
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import AbortController from 'abort-controller'
import { getElementText } from 'puppet-utils'
import {
  renderViaHTTP,
  fetchViaHTTP,
  runNextDev,
  waitFor,
  check
} from 'next-test-utils'

const context = {}

const doPing = page => {
  const controller = new AbortController()
  const signal = controller.signal
  return fetchViaHTTP(context.appPort, '/_next/on-demand-entries-ping', { page }, { signal })
    .then(res => {
      res.body.on('data', chunk => {
        try {
          const payload = JSON.parse(chunk.toString().split('data:')[1])
          if (payload.success || payload.invalid) {
            controller.abort()
          }
        } catch (_) {}
      })
    })
}

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('On Demand Entries', () => {
  it('should pass', () => {})
  beforeAll(async () => {
    context.server = await runNextDev(join(__dirname, '../'))
    context.appPort = context.server.port
  })
  afterAll(() => context.server.close())

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
    const page = await browser.newPage()
    await page.goto(context.server.getURL('/nav'))
    await expect(page).toClick('#to-dynamic')
    await check(
      () => getElementText(page, 'body'),
      /Hello/
    )
    await page.close()
  })
})
