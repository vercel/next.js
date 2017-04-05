/* global jasmine, describe, beforeAll, afterAll, it, expect */
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import {
  nextServer,
  renderViaHTTP,
  startApp,
  stopApp,
  waitFor
} from 'next-test-utils'

const context = {}
context.app = nextServer({
  dir: join(__dirname, '../'),
  dev: true,
  quiet: true
})

jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000

describe('On Demand Entries', () => {
  beforeAll(async () => {
    context.server = await startApp(context.app)
    context.appPort = context.server.address().port
  })
  afterAll(() => stopApp(context.server))

  it('should compile pages for SSR', async () => {
    const pageContent = await renderViaHTTP(context.appPort, '/')
    expect(pageContent.includes('Index Page')).toBeTruthy()
  })

  it('should compile pages for JSON page requests', async () => {
    const pageContent = await renderViaHTTP(context.appPort, '/_next/-/page/about')
    expect(pageContent.includes('About Page')).toBeTruthy()
  })

  it('should dispose inactive pages', async () => {
    await renderViaHTTP(context.appPort, '/_next/-/pages/about')
    const aboutPagePath = resolve(__dirname, '../.next/client-bundles/pages/about.js')
    expect(existsSync(aboutPagePath)).toBeTruthy()

    // Wait maximum of jasmine.DEFAULT_TIMEOUT_INTERVAL checking
    // for disposing /about
    while (true) {
      await waitFor(1000 * 1)
      if (!existsSync(aboutPagePath)) return
    }
  })
})
