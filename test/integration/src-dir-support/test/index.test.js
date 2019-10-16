/* global fixture, test */
import 'testcafe'

import webdriver from 'next-webdriver'
import { join } from 'path'
import fs from 'fs-extra'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  nextBuild,
  nextStart
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const buildIdPath = join(appDir, '.next/BUILD_ID')

function runTests (dev) {
  test('should render normal route', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
    await t.expect(html).match(/my blog/i)
  })

  test('should render another normal route', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/another')
    await t.expect(html).match(/hello from another/)
  })

  test('should render dynamic page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/post-1')
    await t.expect(html).match(/this is.*?post-1/i)
  })

  test('should prioritize a non-dynamic page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/post-1/comments')
    await t.expect(html).match(/show comments for.*post-1.*here/i)
  })

  test('should render nested dynamic page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/post-1/comment-1')
    await t.expect(html).match(/i am.*comment-1.*on.*post-1/i)
  })

  test('should render optional dynamic page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/blog/543/comment')
    // await t.expect(html).match(/blog post.*543.*comment.*all/i)
    await t.expect(html).match(/404/i)
  })

  test('should render nested optional dynamic page', async t => {
    const html = await renderViaHTTP(
      t.fixtureCtx.appPort,
      '/blog/321/comment/123'
    )
    await t.expect(html).match(/blog post.*321.*comment.*123/i)
  })

  test('should render dynamic route with query', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/')
    await browser.elementByCss('#view-post-1-with-query').click()
    await waitFor(1000)
    const url = await browser.eval('window.location.search')
    await t.expect(url).eql('?fromHome=true')
  })

  test('should navigate to a dynamic page successfully', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/')
      await browser.elementByCss('#view-post-1').click()
      await browser.waitForElementByCss('p')

      const text = await browser.elementByCss('p').text()
      await t.expect(text).match(/this is.*?post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  // test('should navigate optional dynamic page', async t => {
  //   let browser
  //   try {
  //     browser = await webdriver(t.fixtureCtx.appPort, '/')
  //     await browser.elementByCss('#view-blog-post-1-comments').click()
  //     await browser.waitForElementByCss('p')

  //     const text = await browser.elementByCss('p').text()
  //     await t.expect(text).match(/blog post.*543.*comment.*\(all\)/i)
  //   } finally {
  //     if (browser) await browser.close()
  //   }
  // })

  test('should navigate optional dynamic page with value', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/')
      await browser.elementByCss('#view-nested-dynamic-cmnt').click()
      await browser.waitForElementByCss('p')

      const text = await browser.elementByCss('p').text()
      await t.expect(text).match(/blog post.*321.*comment.*123/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  test('should navigate to a nested dynamic page successfully', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/')
      await browser.elementByCss('#view-post-1-comment-1').click()
      await browser.waitForElementByCss('p')

      const text = await browser.elementByCss('p').text()
      await t.expect(text).match(/i am.*comment-1.*on.*post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  test('should pass params in getInitialProps during SSR', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/post-1/cmnt-1')
    await t.expect(html).match(/gip.*post-1/i)
  })

  test('should pass params in getInitialProps during client navigation', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/')
      await browser.elementByCss('#view-post-1-comment-1').click()
      await browser.waitForElementByCss('span')

      const text = await browser.elementByCss('span').text()
      await t.expect(text).match(/gip.*post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  test('should update dynamic values on mount', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/on-mount/post-1')
    await t.expect(html).match(/onmpost:.*pending/)

    const browser = await webdriver(t.fixtureCtx.appPort, '/on-mount/post-1')
    await waitFor(1000)
    const text = await browser.eval(`document.body.innerHTML`)
    await t.expect(text).match(/onmpost:.*post-1/)
  })

  test('should not have placeholder query values for SSS', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/on-mount/post-1')
    await t.expect(html).notMatch(/post:.*?\[post\].*?<\/p>/)
  })

  test('should update with a hash in the URL', async t => {
    const browser = await webdriver(
      t.fixtureCtx.appPort,
      '/on-mount/post-1#abc'
    )
    await waitFor(1000)
    const text = await browser.eval(`document.body.innerHTML`)
    await t.expect(text).match(/onmpost:.*post-1/)
  })

  test('should scroll to a hash on mount', async t => {
    const browser = await webdriver(
      t.fixtureCtx.appPort,
      '/on-mount/post-1#item-400'
    )
    await waitFor(1000)

    const text = await browser.eval(`document.body.innerHTML`)
    await t.expect(text).match(/onmpost:.*post-1/)

    const scrollPosition = await browser.eval('window.pageYOffset')
    await t.expect(scrollPosition).eql(7232)
  })

  test('should scroll to a hash on client-side navigation', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/')
    await waitFor(1000)
    await browser.elementByCss('#view-dynamic-with-hash').click()
    await browser.waitForElementByCss('p')

    const text = await browser.elementByCss('p').text()
    await t.expect(text).match(/onmpost:.*test-w-hash/)

    const scrollPosition = await browser.eval('window.pageYOffset')
    await t.expect(scrollPosition).eql(7232)
  })

  if (dev) {
    test('should work with HMR correctly', async t => {
      const browser = await webdriver(t.fixtureCtx.appPort, '/post-1/comments')
      let text = await browser.eval(`document.documentElement.innerHTML`)
      await t.expect(text).match(/comments for.*post-1/)

      const page = join(appDir, 'src/pages/[name]/comments.js')
      const origContent = await fs.readFile(page, 'utf8')
      const newContent = origContent.replace(/comments/, 'commentss')

      try {
        await fs.writeFile(page, newContent, 'utf8')
        await waitFor(3 * 1000)

        let text = await browser.eval(`document.documentElement.innerHTML`)
        await t.expect(text).match(/commentss for.*post-1/)
      } finally {
        await fs.writeFile(page, origContent, 'utf8')
        if (browser) await browser.close()
      }
    })
  } else {
    test('should output modern bundles with dynamic route correctly', async t => {
      const bundlePath = join(
        appDir,
        '.next/static/',
        t.fixtureCtx.buildId,
        'pages/blog/[name]/comment/[id]'
      )

      await fs.access(bundlePath + '.js', fs.constants.F_OK)
      await fs.access(bundlePath + '.module.js', fs.constants.F_OK)
    })
  }
}

const nextConfig = join(appDir, 'next.config.js')

fixture('Dynamic Routing')

fixture('dev mode')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests(true)

fixture('production mode')
  .before(async ctx => {
    const curConfig = await fs.readFile(nextConfig, 'utf8')

    if (curConfig.includes('target')) {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          experimental: { modern: true }
        }
      `
      )
    }
    await nextBuild(appDir)
    ctx.buildId = await fs.readFile(buildIdPath, 'utf8')

    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()

fixture('serverless production mode')
  .before(async ctx => {
    await fs.writeFile(
      nextConfig,
      `
      module.exports = {
        target: 'serverless',
        experimental: {
          modern: true
        }
      }
    `
    )

    await nextBuild(appDir)
    ctx.buildId = await fs.readFile(buildIdPath, 'utf8')

    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()
