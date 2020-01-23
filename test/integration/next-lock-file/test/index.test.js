/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { findPort, launchApp, killApp, nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

let app
let appPort
const appDir = join(__dirname, '../')

describe('Next.js Lock File', () => {
  it('should throw error when valid lock file exists', async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    await killApp(app)
    expect(code).toBe(1)
    expect(stderr).toContain(
      'A Next.js process is already active in this folder'
    )
  })
})
