/* global fixture, test */
import { t } from 'testcafe'

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  stopApp,
  killApp,
  waitFor,
  nextBuild,
  nextStart,
  nextExport,
  startStaticServer,
  initNextServerScript
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

const startServer = async (optEnv = {}) => {
  const scriptPath = join(appDir, 'server.js')
  const env = Object.assign({}, { ...process.env }, optEnv)

  return initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/
  )
}

const expectedManifestRoutes = () => ({
  '/': {
    dataRoute: `/_next/data/${t.fixtureCtx.buildId}/index.json`,
    initialRevalidateSeconds: 1,
    srcRoute: null
  },
  '/blog/[post3]': {
    dataRoute: `/_next/data/${t.fixtureCtx.buildId}/blog/[post3].json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]'
  },
  '/blog/post-1': {
    dataRoute: `/_next/data/${t.fixtureCtx.buildId}/blog/post-1.json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]'
  },
  '/blog/post-2': {
    dataRoute: `/_next/data/${t.fixtureCtx.buildId}/blog/post-2.json`,
    initialRevalidateSeconds: 10,
    srcRoute: '/blog/[post]'
  },
  '/blog/post-1/comment-1': {
    dataRoute: `/_next/data/${t.fixtureCtx.buildId}/blog/post-1/comment-1.json`,
    initialRevalidateSeconds: 2,
    srcRoute: '/blog/[post]/[comment]'
  },
  '/blog/post-2/comment-2': {
    dataRoute: `/_next/data/${t.fixtureCtx.buildId}/blog/post-2/comment-2.json`,
    initialRevalidateSeconds: 2,
    srcRoute: '/blog/[post]/[comment]'
  },
  '/another': {
    dataRoute: `/_next/data/${t.fixtureCtx.buildId}/another.json`,
    initialRevalidateSeconds: 0,
    srcRoute: null
  },
  '/default-revalidate': {
    dataRoute: `/_next/data/${t.fixtureCtx.buildId}/default-revalidate.json`,
    initialRevalidateSeconds: 1,
    srcRoute: null
  },
  '/something': {
    dataRoute: `/_next/data/${t.fixtureCtx.buildId}/something.json`,
    initialRevalidateSeconds: false,
    srcRoute: null
  }
})

const navigateTest = () => {
  test('should navigate between pages successfully', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/')
    let text = await browser.elementByCss('p').text()
    await t.expect(text).match(/hello.*?world/)

    // go to /another
    await browser.elementByCss('#another').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    await t.expect(text).match(/hello.*?world/)

    // go to /
    await browser.eval('window.didTransition = 1')
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#another')
    text = await browser.elementByCss('p').text()
    await t.expect(text).match(/hello.*?world/)
    await t.expect(await browser.eval('window.didTransition')).eql(1)

    // go to /something
    await browser.elementByCss('#something').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    await t.expect(text).match(/hello.*?world/)
    await t.expect(await browser.eval('window.didTransition')).eql(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#post-1')

    // go to /blog/post-1
    await browser.elementByCss('#post-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    await t.expect(text).match(/Post:.*?post-1/)
    await t.expect(await browser.eval('window.didTransition')).eql(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /blog/post-1/comment-1
    await browser.elementByCss('#comment-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p:nth-child(2)').text()
    await t.expect(text).match(/Comment:.*?comment-1/)
    await t.expect(await browser.eval('window.didTransition')).eql(1)

    await browser.close()
  })
}

const runTests = (dev = false) => {
  navigateTest()

  test('should SSR normal page correctly', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
    await t.expect(html).match(/hello.*?world/)
  })

  test('should SSR SPR page correctly', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/blog/post-1')
    await t.expect(html).match(/Post:.*?post-1/)
  })

  test('should return data correctly', async t => {
    const data = JSON.parse(
      await renderViaHTTP(
        t.fixtureCtx.appPort,
        expectedManifestRoutes()['/something'].dataRoute
      )
    )
    await t.expect(data.pageProps.world).eql('world')
  })

  test('should return data correctly for dynamic page', async t => {
    const data = JSON.parse(
      await renderViaHTTP(
        t.fixtureCtx.appPort,
        expectedManifestRoutes()['/blog/post-1'].dataRoute
      )
    )
    await t.expect(data.pageProps.post).eql('post-1')
  })

  test('should return data correctly for dynamic page (non-seeded)', async t => {
    const data = JSON.parse(
      await renderViaHTTP(
        t.fixtureCtx.appPort,
        expectedManifestRoutes()['/blog/post-1'].dataRoute.replace(
          /post-1/,
          'post-3'
        )
      )
    )
    await t.expect(data.pageProps.post).eql('post-3')
  })

  test('should navigate to a normal page and back', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/')
    let text = await browser.elementByCss('p').text()
    await t.expect(text).match(/hello.*?world/)

    await browser.elementByCss('#normal').click()
    await browser.waitForElementByCss('#normal-text')
    text = await browser.elementByCss('#normal-text').text()
    await t.expect(text).match(/a normal page/)
  })

  if (dev) {
    test('should always call getStaticProps without caching in dev', async t => {
      const initialRes = await fetchViaHTTP(t.fixtureCtx.appPort, '/something')
      await t.expect(initialRes.headers.get('cache-control')).notOk()
      const initialHtml = await initialRes.text()
      await t.expect(initialHtml).match(/hello.*?world/)

      const newRes = await fetchViaHTTP(t.fixtureCtx.appPort, '/something')
      await t.expect(newRes.headers.get('cache-control')).notOk()
      const newHtml = await newRes.text()
      await t.expect(newHtml).match(/hello.*?world/)
      await t.expect(initialHtml !== newHtml).eql(true)

      const newerRes = await fetchViaHTTP(t.fixtureCtx.appPort, '/something')
      await t.expect(newerRes.headers.get('cache-control')).notOk()
      const newerHtml = await newerRes.text()
      await t.expect(newerHtml).match(/hello.*?world/)
      await t.expect(newHtml !== newerHtml).eql(true)
    })

    test('should error on bad object from getStaticProps', async t => {
      const indexPage = join(__dirname, '../pages/index.js')
      const origContent = await fs.readFile(indexPage, 'utf8')
      await fs.writeFile(
        indexPage,
        origContent.replace(/\/\/ bad-prop/, 'another: true,')
      )
      await waitFor(1000)
      try {
        const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
        await t.expect(html).match(/Additional keys were returned/)
      } finally {
        await fs.writeFile(indexPage, origContent)
      }
    })
  } else {
    test('should should use correct caching headers for a no-revalidate page', async t => {
      const initialRes = await fetchViaHTTP(t.fixtureCtx.appPort, '/something')
      await t
        .expect(initialRes.headers.get('cache-control'))
        .eql('s-maxage=31536000, stale-while-revalidate')
      const initialHtml = await initialRes.text()
      await t.expect(initialHtml).match(/hello.*?world/)
    })

    test('outputs a prerender-manifest correctly', async t => {
      const manifest = JSON.parse(
        await fs.readFile(join(appDir, '.next/prerender-manifest.json'), 'utf8')
      )
      const escapedBuildId = t.fixtureCtx.buildId.replace(
        /[|\\{}()[\]^$+*?.-]/g,
        '\\$&'
      )

      await t.expect(manifest.version).eql(1)
      await t.expect(manifest.routes).eql(expectedManifestRoutes())
      await t.expect(manifest.dynamicRoutes).eql({
        '/blog/[post]': {
          dataRoute: `/_next/data/${t.fixtureCtx.buildId}/blog/[post].json`,
          dataRouteRegex: `^\\/_next\\/data\\/${escapedBuildId}\\/blog\\/([^\\/]+?)\\.json$`,
          routeRegex: '^\\/blog\\/([^\\/]+?)(?:\\/)?$'
        },
        '/blog/[post]/[comment]': {
          dataRoute: `/_next/data/${
            t.fixtureCtx.buildId
          }/blog/[post]/[comment].json`,
          dataRouteRegex: `^\\/_next\\/data\\/${escapedBuildId}\\/blog\\/([^\\/]+?)\\/([^\\/]+?)\\.json$`,
          routeRegex: '^\\/blog\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$'
        },
        '/user/[user]/profile': {
          dataRoute: `/_next/data/${
            t.fixtureCtx.buildId
          }/user/[user]/profile.json`,
          dataRouteRegex: `^\\/_next\\/data\\/${escapedBuildId}\\/user\\/([^\\/]+?)\\/profile\\.json$`,
          routeRegex: `^\\/user\\/([^\\/]+?)\\/profile(?:\\/)?$`
        }
      })
    })

    test('outputs prerendered files correctly', async t => {
      const routes = [
        '/another',
        '/something',
        '/blog/post-1',
        '/blog/post-2/comment-2'
      ]

      for (const route of routes) {
        await fs.access(
          join(t.fixtureCtx.distPagesDir, `${route}.html`),
          fs.constants.F_OK
        )
        await fs.access(
          join(t.fixtureCtx.distPagesDir, `${route}.json`),
          fs.constants.F_OK
        )
      }
    })

    test('should handle de-duping correctly', async t => {
      let vals = new Array(10).fill(null)

      vals = await Promise.all(
        vals.map(() => renderViaHTTP(t.fixtureCtx.appPort, '/blog/post-10'))
      )
      const val = vals[0]
      await t.expect(val).match(/Post:.*?post-10/)
      await t.expect(new Set(vals).size).eql(1)
    })

    test('should not revalidate when set to false', async t => {
      const route = '/something'
      const initialHtml = await renderViaHTTP(t.fixtureCtx.appPort, route)
      let newHtml = await renderViaHTTP(t.fixtureCtx.appPort, route)
      await t.expect(initialHtml).eql(newHtml)

      newHtml = await renderViaHTTP(t.fixtureCtx.appPort, route)
      await t.expect(initialHtml).eql(newHtml)

      newHtml = await renderViaHTTP(t.fixtureCtx.appPort, route)
      await t.expect(initialHtml).eql(newHtml)
    })

    test('should handle revalidating HTML correctly', async t => {
      const route = '/blog/post-2/comment-2'
      const initialHtml = await renderViaHTTP(t.fixtureCtx.appPort, route)
      await t.expect(initialHtml).match(/Post:.*?post-2/)
      await t.expect(initialHtml).match(/Comment:.*?comment-2/)

      let newHtml = await renderViaHTTP(t.fixtureCtx.appPort, route)
      await t.expect(newHtml).eql(initialHtml)

      await waitFor(2 * 1000)
      await renderViaHTTP(t.fixtureCtx.appPort, route)

      await waitFor(2 * 1000)
      newHtml = await renderViaHTTP(t.fixtureCtx.appPort, route)
      await t.expect(newHtml === initialHtml).eql(false)
      await t.expect(newHtml).match(/Post:.*?post-2/)
      await t.expect(newHtml).match(/Comment:.*?comment-2/)
    })

    test('should handle revalidating JSON correctly', async t => {
      const route = `/_next/data/${
        t.fixtureCtx.buildId
      }/blog/post-2/comment-3.json`
      const initialJson = await renderViaHTTP(t.fixtureCtx.appPort, route)
      await t.expect(initialJson).match(/post-2/)
      await t.expect(initialJson).match(/comment-3/)

      let newJson = await renderViaHTTP(t.fixtureCtx.appPort, route)
      await t.expect(newJson).eql(initialJson)

      await waitFor(2 * 1000)
      await renderViaHTTP(t.fixtureCtx.appPort, route)

      await waitFor(2 * 1000)
      newJson = await renderViaHTTP(t.fixtureCtx.appPort, route)
      await t.expect(newJson === initialJson).eql(false)
      await t.expect(newJson).match(/post-2/)
      await t.expect(newJson).match(/comment-3/)
    })

    test('should not fetch prerender data on mount', async t => {
      const browser = await webdriver(t.fixtureCtx.appPort, '/blog/post-100')
      await browser.eval('window.thisShouldStay = true')
      await waitFor(2 * 1000)
      const val = await browser.eval('window.thisShouldStay')
      await t.expect(val).eql(true)
    })

    test('should not error when flushing cache files', async t => {
      await fetchViaHTTP(t.fixtureCtx.appPort, '/user/user-1/profile')
      await waitFor(500)
      await t
        .expect(t.fixtureCtx.stderr)
        .notMatch(/Failed to update prerender files for/)
    })
  }
}

fixture('SPR Prerender')

fixture('dev mode')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.stderr = ''
    ctx.app = await launchApp(appDir, ctx.appPort, {
      onStderr: msg => {
        ctx.stderr += msg
      }
    })
    ctx.buildId = 'development'
  })
  .after(ctx => killApp(ctx.app))

runTests(true)

fixture('serverless mode')
  .before(async ctx => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { target: 'serverless' }`,
      'utf8'
    )
    await nextBuild(appDir)
    ctx.stderr = ''
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort, {
      onStderr: msg => {
        ctx.stderr += msg
      }
    })
    ctx.distPagesDir = join(appDir, '.next/serverless/pages')
    ctx.buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
  })
  .after(ctx => killApp(ctx.app))

test('renders data correctly', async t => {
  const port = await findPort()
  const server = await startServer({
    BUILD_ID: t.fixtureCtx.buildId,
    PORT: port
  })
  const data = await renderViaHTTP(
    port,
    `/_next/data/${t.fixtureCtx.buildId}/index.json`
  )
  await killApp(server)
  await t.expect(JSON.parse(data).pageProps.world).eql('world')
})

runTests()

fixture('production mode')
  .before(async ctx => {
    try {
      await fs.unlink(nextConfig)
    } catch (_) {}
    await nextBuild(appDir)
    ctx.stderr = ''
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort, {
      onStderr: msg => {
        ctx.stderr += msg
      }
    })
    ctx.buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    ctx.distPagesDir = join(appDir, '.next/server/static', ctx.buildId, 'pages')
  })
  .after(ctx => killApp(ctx.app))

runTests()

fixture('export mode')
  .before(async ctx => {
    ctx.exportDir = join(appDir, 'out')
    await nextBuild(appDir)
    await nextExport(appDir, { outdir: ctx.exportDir })
    ctx.app = await startStaticServer(ctx.exportDir)
    ctx.appPort = ctx.app.address().port
    ctx.buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
  })
  .after(ctx => stopApp(ctx.app))

test('should copy prerender files correctly', async t => {
  const routes = [
    '/another',
    '/something',
    '/blog/post-1',
    '/blog/post-2/comment-2'
  ]

  for (const route of routes) {
    await fs.access(join(t.fixtureCtx.exportDir, `${route}.html`))
    await fs.access(
      join(
        t.fixtureCtx.exportDir,
        '_next/data',
        t.fixtureCtx.buildId,
        `${route}.json`
      )
    )
  }
})

navigateTest()
