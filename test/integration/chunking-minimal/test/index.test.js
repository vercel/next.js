/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { readFile } from 'fs-extra'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('Chunking (minimal)').before(async ctx => {
  await nextBuild(appDir)
  ctx.buildId = await readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
})

test('should have an empty client-manifest', async t => {
  const manifest = await readFile(
    join(appDir, '.next/static', t.fixtureCtx.buildId, '_buildManifest.js'),
    'utf8'
  )
  await t.expect(manifest).notMatch(/\.js/)
})

test('should have an empty modern client-manifest', async t => {
  const manifest = await readFile(
    join(
      appDir,
      '.next/static',
      t.fixtureCtx.buildId,
      '_buildManifest.module.js'
    ),
    'utf8'
  )
  await t.expect(manifest).notMatch(/\.js/)
})
