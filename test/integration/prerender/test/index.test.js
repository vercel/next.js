/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  waitFor
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const appDir = join(__dirname, '..')
let app
let appPort

const runTests = () => {
  it('should navigate between pages successfully', async () => {
    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /another
    await browser.elementByCss('#another').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#another')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /something
    await browser.elementByCss('#something').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#post-1')

    // go to /blog/post-1
    await browser.elementByCss('#post-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Post:.*?SSR/)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /blog/post-1/comment-1
    await browser.elementByCss('#comment-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Comment:.*?SSR/)

    await browser.close()
  })

  it('should SSR content correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/hello.*?world/)
  })

  it('should navigate to a normal page and back', async () => {
    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    await browser.elementByCss('#normal').click()
    await browser.waitForElementByCss('#normal-text')
    text = await browser.elementByCss('#normal-text').text()
    expect(text).toMatch(/a normal page/)
  })

  it('should return JSON when content-type is set', async () => {
    const data = await fetchViaHTTP(appPort, '/', undefined, {
      headers: {
        'content-type': 'application/json'
      }
    }).then(res => res.ok && res.json())

    expect(data.world).toMatch('world')
  })

  it('should generate skeleton without calling getInitialProps', async () => {
    let html = await renderViaHTTP(
      appPort,
      '/blog/post-1?_nextPreviewSkeleton=1'
    )
    expect(html).not.toMatch(/Post:.*?SSR/)

    html = await renderViaHTTP(
      appPort,
      '/blog/post-1/comment-1?_nextPreviewSkeleton=1'
    )
    expect(html).not.toMatch(/Comment:.*?SSR/)
  })

  it('should call getInitialProps client-side when viewing skeleton', async () => {
    let browser = await webdriver(
      appPort,
      '/blog/post-1?_nextPreviewSkeleton=1'
    )
    await waitFor(1000)
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Post:.*?Skeleton/)
    await browser.close()

    browser = await webdriver(
      appPort,
      '/blog/post-1/comment-1?_nextPreviewSkeleton=1'
    )
    await waitFor(1000)
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Comment:.*?Skeleton/)
    await browser.close()
  })
}

describe('SPR Prerender', () => {
  describe('development mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()

    it('outputs a prerender-manifest correctly', async () => {
      const manifest = require(join(appDir, '.next', 'prerender-manifest.json'))
      const pages = manifest.prerenderRoutes.map(route => route.path)

      expect(JSON.stringify(pages.sort())).toBe(
        JSON.stringify(
          [
            '/',
            '/another',
            '/something',
            '/blog/[post]',
            '/blog/[post]/[comment]'
          ].sort()
        )
      )
    })
  })
})
