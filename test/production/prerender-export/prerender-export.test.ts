import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { renderViaHTTP, startStaticServer, waitFor } from 'next-test-utils'
import { AddressInfo, Server } from 'net'

describe('SSG Prerender export', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    dependencies: {
      firebase: '7.14.5',
    },
  })
  if (skipped) return

  let server: Server
  let appPort: number
  let buildId: string

  beforeAll(async () => {
    await next.build()
    const exportDir = path.join(next.testDir, 'out')
    server = await startStaticServer(exportDir)
    appPort = (server.address() as AddressInfo).port
    buildId = (await next.readFile('.next/BUILD_ID')).trim()
  })

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('should copy prerender files and honor exportTrailingSlash', async () => {
    const routes = [
      '/another',
      '/something',
      '/blog/post-1',
      '/blog/post-2/comment-2',
    ]

    for (const route of routes) {
      await next.readFile(`out${route}/index.html`)
      await next.readFile(`out/_next/data/${buildId}${route}.json`)
    }
  })

  it('should navigate between pages successfully', async () => {
    const toBuild = [
      '/',
      '/another',
      '/something',
      '/normal',
      '/blog/post-1',
      '/blog/post-1/comment-1',
      '/catchall/first',
    ]

    await waitFor(2500)

    await Promise.all(toBuild.map((pg) => renderViaHTTP(appPort, pg)))

    const browser = await next.browser('/', { baseUrl: appPort })
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    async function goFromHomeToAnother() {
      await browser.eval('window.beforeAnother = true')
      await browser.elementByCss('#another').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('p').text()
      expect(await browser.eval('window.beforeAnother')).toBe(true)
      expect(text).toMatch(/hello.*?world/)
    }
    await goFromHomeToAnother()

    async function goFromAnotherToHome() {
      await browser.eval('window.didTransition = 1')
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#another')
      text = await browser.elementByCss('p').text()
      expect(text).toMatch(/hello.*?world/)
      expect(await browser.eval('window.didTransition')).toBe(1)
    }
    await goFromAnotherToHome()

    // Client-side SSG data caching test
    {
      await waitFor(2000)
      await goFromHomeToAnother()
      const snapTime = await browser.elementByCss('#anotherTime').text()
      await waitFor(2000)
      await goFromAnotherToHome()
      await goFromHomeToAnother()
      const nextTime = await browser.elementByCss('#anotherTime').text()
      expect(snapTime).toMatch(nextTime)
      await goFromAnotherToHome()
    }

    // go to /something
    await browser.elementByCss('#something').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#post-1')

    // go to /blog/post-1
    await browser.elementByCss('#post-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Post:.*?post-1/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /index
    await browser.elementByCss('#to-nested-index').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello nested index/)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /catchall-optional
    await browser.elementByCss('#catchall-optional-root').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Catch all: \[\]/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /dynamic/[first]
    await browser.elementByCss('#dynamic-first').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('#param').text()
    expect(text).toMatch(/Hi \[first\]!/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /dynamic/[second]
    await browser.elementByCss('#dynamic-second').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('#param').text()
    expect(text).toMatch(/Hi \[second\]!/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /catchall-explicit/[first]/[second]
    await browser.elementByCss('#catchall-explicit-string').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('#catchall').text()
    expect(text).toMatch(/Hi \[first\] \[second\]/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /catchall-explicit/[third]/[fourth]
    await browser.elementByCss('#catchall-explicit-object').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('#catchall').text()
    expect(text).toMatch(/Hi \[third\] \[fourth\]/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /catchall-optional/value
    await browser.elementByCss('#catchall-optional-value').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Catch all: \[value\]/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /blog/post-1/comment-1
    await browser.elementByCss('#comment-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p:nth-child(2)').text()
    expect(text).toMatch(/Comment:.*?comment-1/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /catchall/first
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#to-catchall')
    await browser.elementByCss('#to-catchall').click()
    await browser.waitForElementByCss('#catchall')
    text = await browser.elementByCss('#catchall').text()
    expect(text).toMatch(/Hi.*?first/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    await browser.close()
  })
})
