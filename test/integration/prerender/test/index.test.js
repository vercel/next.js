/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  nextBuild,
  nextStart,
  nextExport,
  startStaticServer
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
let app
let appPort
let distPagesDir
let exportDir

const navigateTest = () => {
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
    expect(text).toMatch(/Post:.*?post-1/)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /blog/post-1/comment-1
    await browser.elementByCss('#comment-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p:nth-child(2)').text()
    expect(text).toMatch(/Comment:.*?comment-1/)

    await browser.close()
  })
}

const runTests = (dev = false) => {
  navigateTest()

  it('should SSR normal page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/hello.*?world/)
  })

  it('should SSR SPR page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1')
    expect(html).toMatch(/Post:.*?post-1/)
  })

  it('should return data correctly', async () => {
    const data = JSON.parse(
      await renderViaHTTP(appPort, '/_next/data/something.json')
    )
    expect(data.pageProps.world).toBe('world')
  })

  it('should return data correctly for dynamic page', async () => {
    const data = JSON.parse(
      await renderViaHTTP(appPort, '/_next/data/blog/post-1.json')
    )
    expect(data.pageProps.post).toBe('post-1')
  })

  it('should return data correctly for dynamic page (non-seeded)', async () => {
    const data = JSON.parse(
      await renderViaHTTP(appPort, '/_next/data/blog/post-3.json')
    )
    expect(data.pageProps.post).toBe('post-3')
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

  if (dev) {
    it('should always call getStaticProps without caching in dev', async () => {
      const initialHtml = await renderViaHTTP(appPort, '/something')
      expect(initialHtml).toMatch(/hello.*?world/)

      const newHtml = await renderViaHTTP(appPort, '/something')
      expect(newHtml).toMatch(/hello.*?world/)
      expect(initialHtml !== newHtml).toBe(true)

      const newerHtml = await renderViaHTTP(appPort, '/something')
      expect(newerHtml).toMatch(/hello.*?world/)
      expect(newHtml !== newerHtml).toBe(true)
    })

    it('should error on bad object from getStaticProps', async () => {
      const indexPage = join(__dirname, '../pages/index.js')
      const origContent = await fs.readFile(indexPage, 'utf8')
      await fs.writeFile(
        indexPage,
        origContent.replace(/\/\/ bad-prop/, 'another: true,')
      )
      await waitFor(1000)
      try {
        const html = await renderViaHTTP(appPort, '/')
        expect(html).toMatch(/Additional keys were returned/)
      } finally {
        await fs.writeFile(indexPage, origContent)
      }
    })
  } else {
    it('outputs a prerender-manifest correctly', async () => {
      const manifest = require(join(appDir, '.next', 'prerender-manifest.json'))

      expect(manifest.version).toBe(1)
      expect(manifest.routes).toEqual({
        '/': {
          initialRevalidateSeconds: 1
        },
        '/blog/[post3]': {
          initialRevalidateSeconds: 10
        },
        '/blog/post-1': {
          initialRevalidateSeconds: 10
        },
        '/blog/post-2': {
          initialRevalidateSeconds: 10
        },
        '/blog/post-1/comment-1': {
          initialRevalidateSeconds: 2
        },
        '/blog/post-2/comment-2': {
          initialRevalidateSeconds: 2
        },
        '/another': {
          initialRevalidateSeconds: 0
        },
        '/default-revalidate': {
          initialRevalidateSeconds: 1
        },
        '/something': {
          initialRevalidateSeconds: false
        }
      })
      expect(manifest.dynamicRoutes).toEqual([
        '/blog/[post]',
        '/blog/[post]/[comment]'
      ])
    })

    it('outputs prerendered files correctly', async () => {
      const routes = [
        '/another',
        '/something',
        '/blog/post-1',
        '/blog/post-2/comment-2'
      ]

      for (const route of routes) {
        await fs.access(join(distPagesDir, `${route}.html`), fs.constants.F_OK)
        await fs.access(join(distPagesDir, `${route}.json`), fs.constants.F_OK)
      }
    })

    it('should handle de-duping correctly', async () => {
      let vals = new Array(10).fill(null)

      vals = await Promise.all(
        vals.map(() => renderViaHTTP(appPort, '/blog/post-10'))
      )
      const val = vals[0]
      expect(val).toMatch(/Post:.*?post-10/)
      expect(new Set(vals).size).toBe(1)
    })

    it('should handle revalidating HTML correctly', async () => {
      const route = '/blog/post-1/comment-1'
      const initialHtml = await renderViaHTTP(appPort, route)
      expect(initialHtml).toMatch(/Post:.*?post-1/)
      expect(initialHtml).toMatch(/Comment:.*?comment-1/)

      await waitFor(2 * 1000)
      await renderViaHTTP(appPort, route)

      await waitFor(2 * 1000)
      const newHtml = await renderViaHTTP(appPort, route)
      expect(newHtml === initialHtml).toBe(false)
      expect(newHtml).toMatch(/Post:.*?post-1/)
      expect(newHtml).toMatch(/Comment:.*?comment-1/)
    })

    it('should handle revalidating JSON correctly', async () => {
      const route = '/_next/data/blog/post-2/comment-3'
      const initialJson = await renderViaHTTP(appPort, route)
      expect(initialJson).toMatch(/post-2/)
      expect(initialJson).toMatch(/comment-3/)

      await waitFor(2 * 1000)
      await renderViaHTTP(appPort, route)

      await waitFor(2 * 1000)
      const newJson = await renderViaHTTP(appPort, route)
      expect(newJson === initialJson).toBe(false)
      expect(newJson).toMatch(/post-2/)
      expect(newJson).toMatch(/comment-3/)
    })
  }
}

describe('SPR Prerender', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`,
        'utf8'
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      distPagesDir = join(appDir, '.next/serverless/pages')
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      try {
        await fs.unlink(nextConfig)
      } catch (_) {}
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      const buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
      distPagesDir = join(appDir, '.next/server/static', buildId, 'pages')
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('export mode', () => {
    beforeAll(async () => {
      exportDir = join(appDir, 'out')
      await nextBuild(appDir)
      await nextExport(appDir, { outdir: exportDir })
      app = await startStaticServer(exportDir)
      appPort = app.address().port
    })
    afterAll(() => killApp(app))

    it('should copy prerender files correctly', async () => {
      const routes = [
        '/another',
        '/something',
        '/blog/post-1',
        '/blog/post-2/comment-2'
      ]

      for (const route of routes) {
        await fs.access(join(exportDir, `${route}.html`))
        await fs.access(join(exportDir, '_next/data', `${route}.json`))
      }
    })

    navigateTest()
  })
})
