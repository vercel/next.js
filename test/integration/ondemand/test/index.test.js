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

jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000

describe('On Demand Entries', () => {
  it('should pass', () => {})
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)
  })
  afterAll(() => killApp(context.server))

  it('should compile pages for SSR', async () => {
    const pageContent = await renderViaHTTP(context.appPort, '/')
    expect(pageContent.includes('Index Page')).toBeTruthy()
  })

  it('should compile pages for JSON page requests', async () => {
    const pageContent = await renderViaHTTP(context.appPort, '/_next/-/page/about')
    expect(pageContent.includes('About Page')).toBeTruthy()
  })

  it('should dispose inactive pages', async () => {
<<<<<<< HEAD
    await renderViaHTTP(context.appPort, '/_next/-/page/about')
=======
    const indexPagePath = resolve(__dirname, '../.next/bundles/pages/index.js')
    expect(existsSync(indexPagePath)).toBeTruthy()
    // Render two pages after the index, since the server keeps at least two pages
    await renderViaHTTP(context.appPort, '/about')
>>>>>>> Keep some buffered pages, that won't be disposed. Fix #1939
    const aboutPagePath = resolve(__dirname, '../.next/bundles/pages/about.js')
    await renderViaHTTP(context.appPort, '/third')
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
