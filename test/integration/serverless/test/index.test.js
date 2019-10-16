/* global fixture, test */
import 'testcafe'

import webdriver from 'next-webdriver'
import { join } from 'path'
import cheerio from 'cheerio'
import { existsSync, readdirSync, readFileSync } from 'fs'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  fetchViaHTTP,
  renderViaHTTP
} from 'next-test-utils'
import qs from 'querystring'
import fetch from 'node-fetch'

const appDir = join(__dirname, '../')
const serverlessDir = join(appDir, '.next/serverless/pages')
const chunksDir = join(appDir, '.next/static/chunks')
const buildIdFile = join(appDir, '.next/BUILD_ID')

fixture('Serverless')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('should render the page', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(html).match(/Hello World/)
})

test('should add autoExport for auto pre-rendered pages', async t => {
  for (const page of ['/', '/abc']) {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, page)
    const $ = cheerio.load(html)
    const data = JSON.parse($('#__NEXT_DATA__').html())
    await t.expect(data.autoExport).eql(true)
  }
})

test('should not add autoExport for non pre-rendered pages', async t => {
  for (const page of ['/fetch']) {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, page)
    const $ = cheerio.load(html)
    const data = JSON.parse($('#__NEXT_DATA__').html())
    await t.expect(!!data.autoExport).eql(false)
  }
})

test('should serve file from public folder', async t => {
  const content = await renderViaHTTP(t.fixtureCtx.appPort, '/hello.txt')
  await t.expect(content.trim()).eql('hello world')

  const legacy = await renderViaHTTP(t.fixtureCtx.appPort, '/static/legacy.txt')
  await t.expect(legacy).contains(`new static folder`)
})

test('should render the page with dynamic import', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/dynamic')
  await t.expect(html).match(/Hello!/)
})

test('should render the page with same dynamic import', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/dynamic-two')
  await t.expect(html).match(/Hello!/)
})

test('should render 404', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/404')
  await t.expect(html).match(/This page could not be found/)
})

test('should render 404 for /_next/static', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/_next/static')
  await t.expect(html).match(/This page could not be found/)
})

test('should render an AMP page', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/some-amp?amp=1')
  await t.expect(html).match(/Hi Im an AMP page/)
  await t.expect(html).match(/ampproject\.org/)
})

test('should have correct amphtml rel link', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/some-amp')
  await t.expect(html).match(/Hi Im an AMP page/)
  await t.expect(html).match(/rel="amphtml" href="\/some-amp\?amp=1"/)
})

test('should have correct canonical link', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/some-amp?amp=1')
  await t.expect(html).match(/rel="canonical" href="\/some-amp"/)
})

test('should render correctly when importing isomorphic-unfetch', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/fetch`
  const res = await fetch(url)
  await t.expect(res.status).eql(200)
  const text = await res.text()
  await t.expect(text.includes('failed')).eql(false)
})

test('should render correctly when importing isomorphic-unfetch on the client side', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  try {
    await browser.elementByCss('a').click()

    await browser.waitForElementByCss('.fetch-page')

    const text = await browser.elementByCss('#text').text()
    await t.expect(text).match(/fetch page/)
  } finally {
    await browser.close()
  }
})

test('should not have combined client-side chunks', async t => {
  await t.expect(readdirSync(chunksDir).length >= 2).ok()
  const buildId = readFileSync(buildIdFile, 'utf8').trim()

  const pageContent = join(appDir, '.next/static', buildId, 'pages/dynamic.js')
  await t.expect(readFileSync(pageContent, 'utf8')).notContains('Hello!')
})

test('should not output _app.js and _document.js to serverless build', async t => {
  await t.expect(existsSync(join(serverlessDir, '_app.js'))).notOk()
  await t.expect(existsSync(join(serverlessDir, '_document.js'))).notOk()
})

test('should replace static pages with HTML files', async t => {
  const staticFiles = ['abc', 'dynamic', 'dynamic-two', 'some-amp']
  for (const file of staticFiles) {
    await t.expect(existsSync(join(serverlessDir, file + '.html'))).eql(true)
    await t.expect(existsSync(join(serverlessDir, file + '.js'))).eql(false)
  }
})

test('should not replace non-static pages with HTML files', async t => {
  const nonStaticFiles = ['fetch', '_error']
  for (const file of nonStaticFiles) {
    await t.expect(existsSync(join(serverlessDir, file + '.js'))).eql(true)
    await t.expect(existsSync(join(serverlessDir, file + '.html'))).eql(false)
  }
})

test('should reply on API request successfully', async t => {
  const content = await renderViaHTTP(t.fixtureCtx.appPort, '/api/hello')
  await t.expect(content).match(/hello world/)
})

test('should reply on dynamic API request successfully', async t => {
  const result = await renderViaHTTP(t.fixtureCtx.appPort, '/api/posts/post-1')
  const { id } = JSON.parse(result)
  await t.expect(id).eql('post-1')
})

test('should reply on dynamic API request successfully with query parameters', async t => {
  const result = await renderViaHTTP(
    t.fixtureCtx.appPort,
    '/api/posts/post-1?param=val'
  )
  const { id, param } = JSON.parse(result)
  await t.expect(id).eql('post-1')
  await t.expect(param).eql('val')
})

test('should reply on dynamic API index request successfully', async t => {
  const result = await renderViaHTTP(
    t.fixtureCtx.appPort,
    '/api/dynamic/post-1'
  )
  const { path } = JSON.parse(result)
  await t.expect(path).eql('post-1')
})

test('should reply on dynamic API index request successfully with query parameters', async t => {
  const result = await renderViaHTTP(
    t.fixtureCtx.appPort,
    '/api/dynamic/post-1?param=val'
  )
  const { path, param } = JSON.parse(result)
  await t.expect(path).eql('post-1')
  await t.expect(param).eql('val')
})

test('should 404 on API request with trailing slash', async t => {
  const res = await fetchViaHTTP(t.fixtureCtx.appPort, '/api/hello/')
  await t.expect(res.status).eql(404)
})

test('should have the correct query string for a dynamic route', async t => {
  const paramRaw = 'test % 123'
  const param = encodeURIComponent(paramRaw)

  const html = await renderViaHTTP(t.fixtureCtx.appPort, `/dr/${param}`)
  const $ = cheerio.load(html)
  const data = JSON.parse($('#__NEXT_DATA__').html())

  await t.expect(data.query).eql({ slug: paramRaw })
})

test('should have the correct query string for a spr route', async t => {
  const paramRaw = 'test % 123'
  const html = await fetchViaHTTP(t.fixtureCtx.appPort, `/dr/[slug]`, '', {
    headers: { 'x-now-route-matches': qs.stringify({ 1: paramRaw }) }
  }).then(res => res.text())
  const $ = cheerio.load(html)
  const data = JSON.parse($('#__NEXT_DATA__').html())

  await t.expect(data.query).eql({ slug: paramRaw })
})

test('should allow etag header support', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/`
  const etag = (await fetch(url)).headers.get('ETag')

  const headers = { 'If-None-Match': etag }
  const res2 = await fetch(url, { headers })
  await t.expect(res2.status).eql(304)
})

test('should set Content-Length header', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}`
  const res = await fetch(url)
  await t.expect(typeof res.headers.get('Content-Length')).notEql('undefined')
})
