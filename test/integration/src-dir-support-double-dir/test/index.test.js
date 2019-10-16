/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import fs from 'fs-extra'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart
} from 'next-test-utils'

const appDir = join(__dirname, '../')

function runTests (dev) {
  test('should render from pages', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
    await t.expect(html).match(/PAGES/)
  })

  test('should render not render from src/pages', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/hello')
    await t.expect(html).match(/404/)
  })
}

const nextConfig = join(appDir, 'next.config.js')

fixture('src dir support double dir')

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

    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()

fixture('SSR production mode')
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

    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()
