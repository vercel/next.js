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
import webdriver from 'next-webdriver'

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

  it('should compile pages with client side <Link />', async () => {
    const browser = await webdriver(context.appPort, '/')
    await browser.elementByCss('#about-link').click()

    // Wait for 3 secs until the pages gets compiled
    await waitFor(1000 * 3)
    const pageContent = await browser.elementByCss('p').text()

    expect(pageContent.includes('About Page')).toBeTruthy()
    await browser.close()
  })

  it('should dispose inactive pages', async () => {
    const aboutPagePath = resolve(__dirname, '../.next/bundles/pages/about.json')
    expect(existsSync(aboutPagePath)).toBeTruthy()

    // Wait for page to get disposed
    await waitFor(1000 * 15)

    expect(existsSync(aboutPagePath)).toBeFalsy()
  })
})
