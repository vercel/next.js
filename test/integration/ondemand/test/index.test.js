/* global fixture, test */
import { t } from 'testcafe'

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
  getBrowserBodyText
} from 'next-test-utils'

const doPing = page => {
  const controller = new AbortController()
  const signal = controller.signal
  return fetchViaHTTP(
    t.fixtureCtx.appPort,
    '/_next/webpack-hmr',
    { page },
    { signal }
  ).then(res => {
    res.body.on('data', chunk => {
      try {
        const payload = JSON.parse(chunk.toString().split('data:')[1])
        if (payload.success || payload.invalid) {
          controller.abort()
        }
      } catch (_) {}
    })
  })
}

fixture('On Demand Entries')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.server)
  })

test('should compile pages for SSR', async t => {
  // The buffer of built page uses the on-demand-entries-ping to know which pages should be
  // buffered. Therefore, we need to double each render call with a ping.
  const pageContent = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await doPing('/')
  await t.expect(pageContent.includes('Index Page')).ok()
})

test('should compile pages for JSON page requests', async t => {
  const pageContent = await renderViaHTTP(
    t.fixtureCtx.appPort,
    '/_next/static/development/pages/about.js'
  )
  await t.expect(pageContent.includes('About Page')).ok()
})

test('should dispose inactive pages', async t => {
  const indexPagePath = resolve(
    __dirname,
    '../.next/static/development/pages/index.js'
  )
  await t.expect(existsSync(indexPagePath)).ok()

  // Render two pages after the index, since the server keeps at least two pages
  await renderViaHTTP(t.fixtureCtx.appPort, '/about')
  await doPing('/about')
  const aboutPagePath = resolve(
    __dirname,
    '../.next/static/development/pages/about.js'
  )

  await renderViaHTTP(t.fixtureCtx.appPort, '/third')
  await doPing('/third')
  const thirdPagePath = resolve(
    __dirname,
    '../.next/static/development/pages/third.js'
  )
  let checks = 1

  while (true) {
    if (checks > 30) {
      throw new Error(
        'exceeded max number of checks for disposing pages correctly'
      )
    }
    await waitFor(1000 * 1)
    // Assert that the two lastly demanded page are not disposed
    await t.expect(existsSync(aboutPagePath)).ok()
    await t.expect(existsSync(thirdPagePath)).ok()
    if (!existsSync(indexPagePath)) return
    checks++
  }
})

test('should navigate to pages with dynamic imports', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav')

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
