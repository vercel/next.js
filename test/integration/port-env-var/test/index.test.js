/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  runNextCommandDev,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = () => {
  it('should serve on the configured port', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('hello from index')
  })
}

describe('PORT environment variable', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await runNextCommandDev([appDir], undefined, {
        env: {
          PORT: appPort,
        },
      })
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await runNextCommandDev(['start', appDir], undefined, {
        env: {
          PORT: appPort,
        },
        nextStart: true,
      })
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
