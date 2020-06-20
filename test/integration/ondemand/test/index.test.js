/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import AbortController from 'abort-controller'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  check,
  getBrowserBodyText,
  getPageFileFromBuildManifest,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const context = {}

const doPing = (page) => {
  const controller = new AbortController()
  const signal = controller.signal
  return fetchViaHTTP(
    context.appPort,
    '/_next/webpack-hmr',
    { page },
    { signal }
  ).then((res) => {
    res.body.on('data', (chunk) => {
      try {
        const payload = JSON.parse(chunk.toString().split('data:')[1])
        if (payload.success || payload.invalid) {
          controller.abort()
        }
      } catch (_) {}
    })
  })
}

jest.setTimeout(1000 * 60 * 5)

describe('On Demand Entries', () => {
  it('should pass', () => {})
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(appDir, context.appPort)
  })
  afterAll(() => {
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
    await renderViaHTTP(context.appPort, '/about')
    const pageFile = getPageFileFromBuildManifest(appDir, '/about')
    const pageContent = await renderViaHTTP(
      context.appPort,
      join('/_next', pageFile)
    )
    expect(pageContent.includes('About Page')).toBeTruthy()
  })

  it('should dispose inactive pages', async () => {
    await renderViaHTTP(context.appPort, '/')
    await doPing('/')
    const indexPage = getPageFileFromBuildManifest(appDir, '/')

    const indexPagePath = resolve(__dirname, join('../.next', indexPage))
    expect(existsSync(indexPagePath)).toBeTruthy()

    // Render two pages after the index, since the server keeps at least two pages
    await renderViaHTTP(context.appPort, '/about')
    await doPing('/about')
    const aboutPage = getPageFileFromBuildManifest(appDir, '/about')
    const aboutPagePath = resolve(__dirname, join('../.next', aboutPage))

    await renderViaHTTP(context.appPort, '/third')
    await doPing('/third')
    const thirdPage = getPageFileFromBuildManifest(appDir, '/third')
    const thirdPagePath = resolve(__dirname, join('../.next', thirdPage))

    // Wait maximum of jest.setTimeout checking
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
        await browser.close()
      }
    }
  })
})
