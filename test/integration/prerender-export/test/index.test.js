/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  renderViaHTTP,
  startStaticServer,
  stopApp,
  waitFor,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let exportDir = join(appDir, 'out')
let app
let appPort
let buildId

const navigateTest = (dev = false) => {
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

    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /another
    async function goFromHomeToAnother() {
      await browser.eval('window.beforeAnother = true')
      await browser.elementByCss('#another').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('p').text()
      expect(await browser.eval('window.beforeAnother')).toBe(true)
      expect(text).toMatch(/hello.*?world/)
    }
    await goFromHomeToAnother()

    // go to /
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
    // eslint-disable-next-line no-lone-blocks
    {
      // Let revalidation period lapse
      await waitFor(2000)

      // Trigger revalidation (visit page)
      await goFromHomeToAnother()
      const snapTime = await browser.elementByCss('#anotherTime').text()

      // Wait for revalidation to finish
      await waitFor(2000)

      // Re-visit page
      await goFromAnotherToHome()
      await goFromHomeToAnother()

      const nextTime = await browser.elementByCss('#anotherTime').text()
      if (dev) {
        expect(snapTime).not.toMatch(nextTime)
      } else {
        expect(snapTime).toMatch(nextTime)
      }

      // Reset to Home for next test
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

    // go to /catchall-explicit/[first]/[second]
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
}

describe('SSG Prerender export', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('export mode', () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
        await fs.remove(exportDir)
        await nextBuild(appDir, undefined, { cwd: appDir })
        app = await startStaticServer(exportDir)
        appPort = app.address().port
        buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
      })

      afterAll(async () => {
        if (app) {
          await stopApp(app)
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
          await fs.access(join(exportDir, `${route}/index.html`))
          await fs.access(
            join(exportDir, '_next/data', buildId, `${route}.json`)
          )
        }
      })

      navigateTest()
    })
  })
})
