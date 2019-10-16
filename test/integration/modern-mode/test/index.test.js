/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { readFileSync, readdirSync } from 'fs'
import rimraf from 'rimraf'
import { promisify } from 'util'
import { nextServer, runNextCommand, startApp, stopApp } from 'next-test-utils'

const rimrafPromise = promisify(rimraf)
let appDir = join(__dirname, '..')

fixture('Modern Mode')
  .before(async ctx => {
    await runNextCommand(['build'], {
      cwd: appDir,
      stdout: true,
      stderr: true
    })

    ctx.app = nextServer({
      dir: appDir,
      dev: false,
      quiet: true,
      experimental: {
        modern: true
      }
    })

    ctx.server = await startApp(ctx.app)
    // appPort = server.address().port
  })
  .after(async ctx => {
    stopApp(ctx.server)
    rimrafPromise(join(appDir, '.next'))
  })

test('should generate client side modern and legacy build files', async t => {
  const buildId = readFileSync(join(appDir, '.next/BUILD_ID'), 'utf8')

  const expectedFiles = [
    'index',
    '_app',
    '_error',
    'main',
    'webpack',
    'commons'
  ]
  const buildFiles = [
    ...readdirSync(join(appDir, '.next/static', buildId, 'pages')),
    ...readdirSync(join(appDir, '.next/static/runtime')).map(
      file => file.replace(/-\w+\./, '.') // remove hash
    ),
    ...readdirSync(join(appDir, '.next/static/chunks')).map(
      file => file.replace(/\.\w+\./, '.') // remove hash
    )
  ]

  console.log(`Client files: ${buildFiles.join(', ')}`)

  await Promise.all(
    expectedFiles.map(async file => {
      await t.expect(buildFiles).contains(`${file}.js`)
      await t.expect(buildFiles).contains(`${file}.module.js`)
    })
  )
})
