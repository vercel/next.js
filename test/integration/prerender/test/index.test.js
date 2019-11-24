/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  nextBuild,
  nextStart,
  stopApp,
  nextExport,
  startStaticServer,
  initNextServerScript,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
let app
let appPort
let buildId
let distPagesDir
let exportDir
let stderr

const startServer = async (optEnv = {}) => {
  const scriptPath = join(appDir, 'server.js')
  const env = Object.assign(
    {},
    { ...process.env },
    { PORT: `${appPort}` },
    optEnv
  )

  return initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/
  )
}

const expectedManifestRoutes = () => ({
  '/': {
    dataRoute: `/_next/data/${buildId}/index.json`,
    initialRevalidateSeconds: 1,
    srcRoute: null,
  },
  '/blog/[post3]': {
    dataRoute: `/_next/data/${buildId}/blog/[post3].json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]',
  },
  '/blog/post-1': {
    dataRoute: `/_next/data/${buildId}/blog/post-1.json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]',
  },
  '/blog/post-2': {
    dataRoute: `/_next/data/${buildId}/blog/post-2.json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]',
  },
  '/blog/post-1/comment-1': {
    dataRoute: `/_next/data/${buildId}/blog/post-1/comment-1.json`,
    initialRevalidateSeconds: 2,
    srcRoute: '/blog/[post]/[comment]',
  },
  '/blog/post-2/comment-2': {
    dataRoute: `/_next/data/${buildId}/blog/post-2/comment-2.json`,
    initialRevalidateSeconds: 2,
    srcRoute: '/blog/[post]/[comment]',
  },
  '/blog/post.1': {
    dataRoute: `/_next/data/${buildId}/blog/post.1.json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]',
  },
  '/another': {
    dataRoute: `/_next/data/${buildId}/another.json`,
    initialRevalidateSeconds: 1,
    srcRoute: null,
  },
  '/blog': {
    dataRoute: `/_next/data/${buildId}/blog.json`,
    initialRevalidateSeconds: 10,
    srcRoute: null,
  },
  '/default-revalidate': {
    dataRoute: `/_next/data/${buildId}/default-revalidate.json`,
    initialRevalidateSeconds: 1,
    srcRoute: null,
  },
  '/something': {
    dataRoute: `/_next/data/${buildId}/something.json`,
    initialRevalidateSeconds: false,
    srcRoute: null,
  },
})

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
    await browser.eval('window.didTransition = 1')
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#another')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)
    expect(await browser.eval('window.didTransition')).toBe(1)

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

    // go to /blog/post-1/comment-1
    await browser.elementByCss('#comment-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p:nth-child(2)').text()
    expect(text).toMatch(/Comment:.*?comment-1/)
    expect(await browser.eval('window.didTransition')).toBe(1)

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
      await renderViaHTTP(
        appPort,
        expectedManifestRoutes()['/something'].dataRoute
      )
    )
    expect(data.pageProps.world).toBe('world')
  })

  it('should return data correctly for dynamic page', async () => {
    const data = JSON.parse(
      await renderViaHTTP(
        appPort,
        expectedManifestRoutes()['/blog/post-1'].dataRoute
      )
    )
    expect(data.pageProps.post).toBe('post-1')
  })

  it('should return data correctly for dynamic page (non-seeded)', async () => {
    const data = JSON.parse(
      await renderViaHTTP(
        appPort,
        expectedManifestRoutes()['/blog/post-1'].dataRoute.replace(
          /post-1/,
          'post-3'
        )
      )
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
      const initialRes = await fetchViaHTTP(appPort, '/something')
      expect(initialRes.headers.get('cache-control')).toBeFalsy()
      const initialHtml = await initialRes.text()
      expect(initialHtml).toMatch(/hello.*?world/)

      const newRes = await fetchViaHTTP(appPort, '/something')
      expect(newRes.headers.get('cache-control')).toBeFalsy()
      const newHtml = await newRes.text()
      expect(newHtml).toMatch(/hello.*?world/)
      expect(initialHtml !== newHtml).toBe(true)

      const newerRes = await fetchViaHTTP(appPort, '/something')
      expect(newerRes.headers.get('cache-control')).toBeFalsy()
      const newerHtml = await newerRes.text()
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

    it('should show error when getStaticParams is used without getStaticProps', async () => {
      const pagePath = join(appDir, 'pages/no-getStaticProps.js')
      await fs.writeFile(
        pagePath,
        `
        export async function unstable_getStaticParams() {
          return []
        }

        export default () => 'hi'
      `,
        'utf8'
      )

      const html = await renderViaHTTP(appPort, '/no-getStaticProps')
      await fs.remove(pagePath)
      await waitFor(500)

      expect(html).toMatch(
        /unstable_getStaticParams was added without a unstable_getStaticProps in/
      )
    })
  } else {
    it('should should use correct caching headers for a no-revalidate page', async () => {
      const initialRes = await fetchViaHTTP(appPort, '/something')
      expect(initialRes.headers.get('cache-control')).toBe(
        's-maxage=31536000, stale-while-revalidate'
      )
      const initialHtml = await initialRes.text()
      expect(initialHtml).toMatch(/hello.*?world/)
    })

    it('outputs a prerender-manifest correctly', async () => {
      const manifest = JSON.parse(
        await fs.readFile(join(appDir, '.next/prerender-manifest.json'), 'utf8')
      )
      const escapedBuildId = buildId.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')

      expect(manifest.version).toBe(1)
      expect(manifest.routes).toEqual(expectedManifestRoutes())
      expect(manifest.dynamicRoutes).toEqual({
        '/blog/[post]': {
          dataRoute: `/_next/data/${buildId}/blog/[post].json`,
          dataRouteRegex: `^\\/_next\\/data\\/${escapedBuildId}\\/blog\\/([^\\/]+?)\\.json$`,
          routeRegex: '^\\/blog\\/([^\\/]+?)(?:\\/)?$',
        },
        '/blog/[post]/[comment]': {
          dataRoute: `/_next/data/${buildId}/blog/[post]/[comment].json`,
          dataRouteRegex: `^\\/_next\\/data\\/${escapedBuildId}\\/blog\\/([^\\/]+?)\\/([^\\/]+?)\\.json$`,
          routeRegex: '^\\/blog\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$',
        },
        '/user/[user]/profile': {
          dataRoute: `/_next/data/${buildId}/user/[user]/profile.json`,
          dataRouteRegex: `^\\/_next\\/data\\/${escapedBuildId}\\/user\\/([^\\/]+?)\\/profile\\.json$`,
          routeRegex: `^\\/user\\/([^\\/]+?)\\/profile(?:\\/)?$`,
        },
      })
    })

    it('outputs prerendered files correctly', async () => {
      const routes = [
        '/another',
        '/something',
        '/blog/post-1',
        '/blog/post-2/comment-2',
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

    it('should not revalidate when set to false', async () => {
      const route = '/something'
      const initialHtml = await renderViaHTTP(appPort, route)
      let newHtml = await renderViaHTTP(appPort, route)
      expect(initialHtml).toBe(newHtml)

      newHtml = await renderViaHTTP(appPort, route)
      expect(initialHtml).toBe(newHtml)

      newHtml = await renderViaHTTP(appPort, route)
      expect(initialHtml).toBe(newHtml)
    })

    it('should handle revalidating HTML correctly', async () => {
      const route = '/blog/post-2/comment-2'
      const initialHtml = await renderViaHTTP(appPort, route)
      expect(initialHtml).toMatch(/Post:.*?post-2/)
      expect(initialHtml).toMatch(/Comment:.*?comment-2/)

      let newHtml = await renderViaHTTP(appPort, route)
      expect(newHtml).toBe(initialHtml)

      await waitFor(2 * 1000)
      await renderViaHTTP(appPort, route)

      await waitFor(2 * 1000)
      newHtml = await renderViaHTTP(appPort, route)
      expect(newHtml === initialHtml).toBe(false)
      expect(newHtml).toMatch(/Post:.*?post-2/)
      expect(newHtml).toMatch(/Comment:.*?comment-2/)
    })

    it('should handle revalidating JSON correctly', async () => {
      const route = `/_next/data/${buildId}/blog/post-2/comment-3.json`
      const initialJson = await renderViaHTTP(appPort, route)
      expect(initialJson).toMatch(/post-2/)
      expect(initialJson).toMatch(/comment-3/)

      let newJson = await renderViaHTTP(appPort, route)
      expect(newJson).toBe(initialJson)

      await waitFor(2 * 1000)
      await renderViaHTTP(appPort, route)

      await waitFor(2 * 1000)
      newJson = await renderViaHTTP(appPort, route)
      expect(newJson === initialJson).toBe(false)
      expect(newJson).toMatch(/post-2/)
      expect(newJson).toMatch(/comment-3/)
    })

    it('should not fetch prerender data on mount', async () => {
      const browser = await webdriver(appPort, '/blog/post-100')
      await browser.eval('window.thisShouldStay = true')
      await waitFor(2 * 1000)
      const val = await browser.eval('window.thisShouldStay')
      expect(val).toBe(true)
    })

    it('should not error when flushing cache files', async () => {
      await fetchViaHTTP(appPort, '/user/user-1/profile')
      await waitFor(500)
      expect(stderr).not.toMatch(/Failed to update prerender files for/)
    })
  }
}

describe('SPR Prerender', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr: msg => {
          stderr += msg
        },
      })
      buildId = 'development'
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
      stderr = ''
      appPort = await findPort()
      app = nextStart(appDir, appPort, {
        onStderr: msg => {
          stderr += msg
        },
      })
      distPagesDir = join(appDir, '.next/serverless/pages')
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))

    it('renders data correctly', async () => {
      const port = await findPort()
      const server = await startServer({
        BUILD_ID: buildId,
        PORT: port,
      })
      const data = await renderViaHTTP(
        port,
        `/_next/data/${buildId}/index.json`
      )
      await killApp(server)
      expect(JSON.parse(data).pageProps.world).toBe('world')
    })

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(nextConfig)
      await nextBuild(appDir)
      stderr = ''
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        onStderr: msg => {
          stderr += msg
        },
      })
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
      distPagesDir = join(appDir, '.next/server/static', buildId, 'pages')
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('export mode', () => {
    beforeAll(async () => {
      exportDir = join(appDir, 'out')
      await fs.writeFile(
        nextConfig,
        `module.exports = {
          exportTrailingSlash: true,
          exportPathMap: function(defaultPathMap) {
            if (defaultPathMap['/blog/[post]']) {
              throw new Error('Found SPR page in the default export path map')
            }
            return defaultPathMap
          },
        }`
      )
      await nextBuild(appDir)
      await nextExport(appDir, { outdir: exportDir })
      app = await startStaticServer(exportDir)
      appPort = app.address().port
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(async () => {
      await stopApp(app)
      await fs.remove(nextConfig)
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
