/* global fixture, test */
import 'testcafe'

import webdriver from 'next-webdriver'
import { join } from 'path'
import getPort from 'get-port'
import clone from 'clone'
import {
  initNextServerScript,
  killApp,
  renderViaHTTP,
  fetchViaHTTP,
  check,
  File
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const indexPg = new File(join(appDir, 'pages/index.js'))

const startServer = async (ctx, optEnv = {}) => {
  const scriptPath = join(appDir, 'server.js')
  ctx.appPort = await getPort()
  const env = Object.assign(
    {},
    clone(process.env),
    { PORT: `${ctx.appPort}` },
    optEnv
  )

  ctx.server = await initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/
  )
}

fixture('Custom Server')

fixture('with dynamic assetPrefix')
  .before(ctx => startServer(ctx))
  .after(ctx => killApp(ctx.server))

test('should handle render with undefined query', async t => {
  await t
    .expect(await renderViaHTTP(t.fixtureCtx.appPort, '/no-query'))
    .match(/"query":/)
})

test('should set the assetPrefix dynamically', async t => {
  const normalUsage = await renderViaHTTP(t.fixtureCtx.appPort, '/asset')
  await t.expect(normalUsage).notMatch(/127\.0\.0\.1/)

  const dynamicUsage = await renderViaHTTP(
    t.fixtureCtx.appPort,
    '/asset?setAssetPrefix=1'
  )
  await t.expect(dynamicUsage).match(/127\.0\.0\.1/)
})

test('should handle null assetPrefix accordingly', async t => {
  const normalUsage = await renderViaHTTP(
    t.fixtureCtx.appPort,
    '/asset?setEmptyAssetPrefix=1'
  )
  await t.expect(normalUsage).match(/"\/_next/)
})

test('should set the assetPrefix to a given request', async t => {
  for (let lc = 0; lc < 1000; lc++) {
    const [normalUsage, dynamicUsage] = await Promise.all([
      await renderViaHTTP(t.fixtureCtx.appPort, '/asset'),
      await renderViaHTTP(t.fixtureCtx.appPort, '/asset?setAssetPrefix=1')
    ])

    await t.expect(normalUsage).notMatch(/127\.0\.0\.1/)
    await t.expect(dynamicUsage).match(/127\.0\.0\.1/)
  }
})

test('should render nested index', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/dashboard')
  await t.expect(html).match(/made it to dashboard/)
})

fixture('with generateEtags enabled')
  .before(ctx => startServer(ctx, { GENERATE_ETAGS: 'true' }))
  .after(ctx => killApp(ctx.server))

test('response includes etag header', async t => {
  const response = await fetchViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(response.headers.get('etag')).ok()
})

fixture('with generateEtags disabled')
  .before(ctx => startServer(ctx, { GENERATE_ETAGS: 'false' }))
  .after(ctx => killApp(ctx.server))

test('response does not include etag header', async t => {
  const response = await fetchViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(response.headers.get('etag')).eql(null)
})

fixture('HMR with custom server')
  .before(ctx => startServer(ctx))
  .after(ctx => {
    killApp(ctx.server)
    indexPg.restore()
  })

test('Should support HMR when rendering with /index pathname', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/test-index-hmr')
    const text = await browser.elementByCss('#go-asset').text()
    await t.expect(text).eql('Asset')

    indexPg.replace('Asset', 'Asset!!')

    await check(() => browser.elementByCss('#go-asset').text(), /Asset!!/)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})
