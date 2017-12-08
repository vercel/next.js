/* global jasmine, describe, beforeAll, afterAll, it, expect */
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor
} from 'next-test-utils'

const context = {}

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('On Demand Entries', () => {
  it('should pass', () => {})
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)
  })
  afterAll(() => killApp(context.server))

  it('should compile pages for SSR', async () => {
    // The buffer of built page uses the on-demand-entries-ping to know which pages should be
    // buffered. Therefore, we need to double each render call with a ping.
    const pageContent = await renderViaHTTP(context.appPort, '/')
    await renderViaHTTP(context.appPort, '/_next/on-demand-entries-ping', {page: '/'})
    expect(pageContent.includes('Index Page')).toBeTruthy()
  })

  it('should compile pages for JSON page requests', async () => {
    const pageContent = await renderViaHTTP(context.appPort, '/_next/-/page/about')
    expect(pageContent.includes('About Page')).toBeTruthy()
  })

  it('should dispose inactive pages', async () => {
    const indexPagePath = resolve(__dirname, '../.next/bundles/pages/index.js')
    expect(existsSync(indexPagePath)).toBeTruthy()

    // Render two pages after the index, since the server keeps at least two pages
    await renderViaHTTP(context.appPort, '/_next/-/page/about')
    await renderViaHTTP(context.appPort, '/_next/on-demand-entries-ping', {page: '/about'})
    const aboutPagePath = resolve(__dirname, '../.next/bundles/pages/about.js')

    await renderViaHTTP(context.appPort, '/_next/-/page/third')
    await renderViaHTTP(context.appPort, '/_next/on-demand-entries-ping', {page: '/third'})
    const thirdPagePath = resolve(__dirname, '../.next/bundles/pages/third.js')

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
})
