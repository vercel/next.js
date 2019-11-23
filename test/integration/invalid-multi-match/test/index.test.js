/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let appDir = join(__dirname, '..')
let stderr = ''
let appPort
let app

const runTests = () => {
  it('should show error for invalid mulit-match', async () => {
    await renderViaHTTP(appPort, '/hello')
    expect(stderr).toContain(
      'To use a multi-match in the destination you must add'
    )
    expect(stderr).toContain('https://err.sh/zeit/next.js/invalid-multi-match')
  })
}

describe('Custom routes', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr: msg => {
          stderr += msg
        },
      })
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        onStderr: msg => {
          stderr += msg
        },
      })
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
