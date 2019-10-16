/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  nextBuild,
  nextExport,
  startStaticServer,
  launchApp,
  stopApp,
  killApp,
  findPort,
  renderViaHTTP,
  File
} from 'next-test-utils'

import fs from 'fs'
import { promisify } from 'util'
import ssr from './ssr'
import browser from './browser'
import dev from './dev'
import dynamic from './dynamic'
import apiRoutes from './api-routes'

const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)
const access = promisify(fs.access)
const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))

fixture('Static Export')
  .before(async ctx => {
    const outdir = join(appDir, 'out')
    const outNoTrailSlash = join(appDir, 'outNoTrailSlash')

    await nextBuild(appDir)
    await nextExport(appDir, { outdir })

    nextConfig.replace(
      `exportTrailingSlash: true`,
      `exportTrailingSlash: false`
    )
    await nextBuild(appDir)
    await nextExport(appDir, { outdir: outNoTrailSlash })
    nextConfig.restore()

    ctx.server = await startStaticServer(outdir)
    ctx.port = ctx.server.address().port

    ctx.serverNoTrailSlash = await startStaticServer(outNoTrailSlash)
    ctx.portNoTrailSlash = ctx.serverNoTrailSlash.address().port

    ctx.devPort = await findPort()
    ctx.devServer = await launchApp(join(__dirname, '../'), ctx.devPort, true)
    ctx.appDir = appDir

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(ctx.devPort, '/'),
      renderViaHTTP(ctx.devPort, '/dynamic/one')
    ])
  })
  .after(async ctx => {
    await Promise.all([
      stopApp(ctx.server),
      killApp(ctx.devServer),
      stopApp(ctx.serverNoTrailSlash)
    ])
  })

test('should delete existing exported files', async t => {
  const outdir = join(appDir, 'out')
  const tempfile = join(outdir, 'temp.txt')

  await mkdir(outdir).catch(e => {
    if (e.code !== 'EEXIST') throw e
  })
  await writeFile(tempfile, 'Hello there')

  await nextBuild(appDir)
  await nextExport(appDir, { outdir })

  let doesNotExist = false
  await access(tempfile).catch(e => {
    if (e.code === 'ENOENT') doesNotExist = true
  })
  await t.expect(doesNotExist).eql(true)
})

ssr()
browser()
dev()
dynamic()
apiRoutes()
