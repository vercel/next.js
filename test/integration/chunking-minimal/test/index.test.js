/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { readFile } from 'fs-extra'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = join(__dirname, '../')
let buildId

describe('Chunking (minimal)', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    buildId = await readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
  })

  it('should have an empty client-manifest', async () => {
    const manifest = await readFile(
      join(appDir, '.next/static', buildId, '_buildManifest.js'),
      'utf8'
    )
    expect(manifest).not.toMatch(/\.js/)
  })

  it('should have an empty modern client-manifest', async () => {
    const manifest = await readFile(
      join(appDir, '.next/static', buildId, '_buildManifest.module.js'),
      'utf8'
    )
    expect(manifest).not.toMatch(/\.js/)
  })
})
