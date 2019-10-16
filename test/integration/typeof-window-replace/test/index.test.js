/* global fixture, test */
import 'testcafe'

import fs from 'fs-extra'
import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '../app')

fixture('typeof window replace').before(async ctx => {
  await nextBuild(appDir)
  ctx.buildId = await fs.readFile(path.join(appDir, '.next/BUILD_ID'), 'utf8')
})

test('Replaces `typeof window` with object for client code', async t => {
  const content = await fs.readFile(
    path.join(appDir, '.next/static/', t.fixtureCtx.buildId, 'pages/index.js'),
    'utf8'
  )
  await t.expect(content).match(/Hello.*?,.*?("|')object("|')/)
})

test('Replaces `typeof window` with undefined for server code', async t => {
  const content = await fs.readFile(
    path.join(
      appDir,
      '.next/server/static',
      t.fixtureCtx.buildId,
      'pages/index.js'
    ),
    'utf8'
  )
  await t.expect(content).match(/Hello.*?,.*?("|')undefined("|')/)
})

test('Does not replace `typeof window` for `node_modules` code', async t => {
  const content = await fs.readFile(
    path.join(appDir, '.next/static/', t.fixtureCtx.buildId, 'pages/index.js'),
    'utf8'
  )
  await t.expect(content).match(/MyComp:.*?,.*?typeof window/)
})
