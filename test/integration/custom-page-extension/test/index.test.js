/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  nextBuild,
  nextStart,
  findPort,
  launchApp,
  killApp,
  renderViaHTTP,
  File
} from 'next-test-utils'

const appDir = join(__dirname, '..')

const runTests = () => {
  test('should work with normal page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/blog')
    await t.expect(html).contains('Blog - CPE')
  })

  test('should work dynamic page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/blog/nextjs')
    await t.expect(html).contains('Post - nextjs')
  })
}

fixture('Custom page extension')

fixture('dev mode')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()

fixture('production mode')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()

const nextConfig = new File(join(appDir, 'next.config.js'))

fixture('serverless mode')
  .before(async ctx => {
    nextConfig.replace('server', 'serverless')
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
    nextConfig.restore()
  })

runTests()
