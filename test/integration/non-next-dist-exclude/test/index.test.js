/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import path from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = path.join(__dirname, '../app')
let buildId

describe('Non-Next externalization', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    buildId = await fs.readFile(path.join(appDir, '.next/BUILD_ID'), 'utf8')
  })

  it('Externalized non-Next dist-using package', async () => {
    const content = await fs.readFile(
      path.join(appDir, '.next/server/static', buildId, 'pages/index.js'),
      'utf8'
    )
    expect(content).not.toContain('BrokenExternalMarker')
  })
})
