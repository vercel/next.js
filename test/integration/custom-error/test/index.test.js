/* global fixture, test */
import 'testcafe'

import fs from 'fs-extra'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  nextBuild,
  nextStart,
  killApp
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

const runTests = () => {
  test('renders custom _error successfully', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
    await t.expect(html).match(/Custom error/)
  })
}

fixture('Custom _error')

fixture('production mode')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()

fixture('serverless mode')
  .before(async ctx => {
    await fs.writeFile(nextConfig, `module.exports = { target: 'serverless' }`)
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
    await fs.remove(nextConfig)
  })

runTests()
