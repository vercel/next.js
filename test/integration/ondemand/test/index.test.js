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
    await renderViaHTTP(context.appPort, '/_next/-/page/about')
    const aboutPagePath = resolve(__dirname, '../.next/bundles/pages/about.js')
    expect(existsSync(aboutPagePath)).toBeTruthy()

    // Wait maximum of jasmine.DEFAULT_TIMEOUT_INTERVAL checking
    // for disposing /about
    while (true) {
      await waitFor(1000 * 1)
      if (!existsSync(aboutPagePath)) return
    }
  })
})
