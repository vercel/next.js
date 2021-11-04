/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  check,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextExport,
  renderViaHTTP,
  startStaticServer,
  stopApp,
  waitFor,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')
let app
let appPort
let buildId
let exportDir

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

describe('SSG Prerender', () => {
  describe('dev mode getStaticPaths', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfigPath,
        // we set cpus to 1 so that we make sure the requests
        // aren't being cached at the jest-worker level
        `module.exports = { experimental: { cpus: 1 } }`
      )
      await fs.remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
      })
    })
    afterAll(async () => {
      await fs.remove(nextConfigPath)
      await killApp(app)
    })

    it('should work with firebase import and getStaticPaths', async () => {
      const html = await renderViaHTTP(appPort, '/blog/post-1')
      expect(html).toContain('post-1')
      expect(html).not.toContain('Error: Failed to load')

      const html2 = await renderViaHTTP(appPort, '/blog/post-1')
      expect(html2).toContain('post-1')
      expect(html2).not.toContain('Error: Failed to load')
    })

    it('should not cache getStaticPaths errors', async () => {
      const errMsg = /The `fallback` key must be returned from getStaticPaths/
      await check(() => renderViaHTTP(appPort, '/blog/post-1'), /post-1/)

      const blogPage = join(appDir, 'pages/blog/[post]/index.js')
      const origContent = await fs.readFile(blogPage, 'utf8')
      await fs.writeFile(
        blogPage,
        origContent.replace('fallback: true,', '/* fallback: true, */')
      )

      try {
        await check(() => renderViaHTTP(appPort, '/blog/post-1'), errMsg)

        await fs.writeFile(blogPage, origContent)
        await check(() => renderViaHTTP(appPort, '/blog/post-1'), /post-1/)
      } finally {
        await fs.writeFile(blogPage, origContent)
      }
    })
  })

  describe('export mode', () => {
    // disable fallback: true since this is an error during `next export`
    const fallbackTruePages = [
      '/blog/[post]/[comment].js',
      '/user/[user]/profile.js',
      '/catchall/[...slug].js',
      '/non-json/[p].js',
      '/blog/[post]/index.js',
      '/fallback-only/[slug].js',
      '/api-docs/[...slug].js',
    ]
    const fallbackBlockingPages = [
      '/blocking-fallback/[slug].js',
      '/blocking-fallback-once/[slug].js',
      '/blocking-fallback-some/[slug].js',
      '/non-json-blocking/[p].js',
    ]

    const brokenPages = ['/bad-gssp.js', '/bad-ssr.js']

    const fallbackTruePageContents = {}
    const fallbackBlockingPageContents = {}

    beforeAll(async () => {
      exportDir = join(appDir, 'out')
      await fs.writeFile(
        nextConfigPath,
        `module.exports = {
          exportTrailingSlash: true,
          exportPathMap: function(defaultPathMap) {
            if (defaultPathMap['/blog/[post]']) {
              throw new Error('Found Incremental page in the default export path map')
            }
            return defaultPathMap
          },
        }`
      )
      await fs.remove(join(appDir, '.next'))

      for (const page of fallbackTruePages) {
        const pagePath = join(appDir, 'pages', page)
        fallbackTruePageContents[page] = await fs.readFile(pagePath, 'utf8')
        await fs.writeFile(
          pagePath,
          fallbackTruePageContents[page].replace(
            'fallback: true',
            'fallback: false'
          )
        )
      }

      for (const page of fallbackBlockingPages) {
        const pagePath = join(appDir, 'pages', page)
        fallbackBlockingPageContents[page] = await fs.readFile(pagePath, 'utf8')
        await fs.writeFile(
          pagePath,
          fallbackBlockingPageContents[page].replace(
            "fallback: 'blocking'",
            'fallback: false'
          )
        )
      }

      for (const page of brokenPages) {
        const pagePath = join(appDir, 'pages', page)
        await fs.rename(pagePath, `${pagePath}.bak`)
      }

      await nextBuild(appDir, undefined, { cwd: appDir })
      await nextExport(appDir, { outdir: exportDir, cwd: appDir })
      app = await startStaticServer(exportDir)
      appPort = app.address().port
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(async () => {
      await fs.remove(nextConfigPath)
      await stopApp(app)

      for (const page of fallbackTruePages) {
        const pagePath = join(appDir, 'pages', page)
        await fs.writeFile(pagePath, fallbackTruePageContents[page])
      }

      for (const page of fallbackBlockingPages) {
        const pagePath = join(appDir, 'pages', page)
        await fs.writeFile(pagePath, fallbackBlockingPageContents[page])
      }

      for (const page of brokenPages) {
        const pagePath = join(appDir, 'pages', page)
        await fs.rename(`${pagePath}.bak`, pagePath)
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
        await fs.access(join(exportDir, '_next/data', buildId, `${route}.json`))
      }
    })

    navigateTest()
  })
})
